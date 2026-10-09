#!/usr/bin/env python3
"""Builds a small Android APK of The Zombies without Android Studio / Gradle.

The app is a fullscreen WebView (smali sources in ./smali) that serves the game
from assets/www at http://localhost/ (a secure context, so voice chat works).

Tools (set TOOLS=/path):  aapt2 (linux x64), android.jar (API 33),
smali-3.x.jar (+ its deps), and node with the npm package apk_sign_ts.
Keys: ./keys/key.pem + ./keys/cert.pem (keep them! updates must be signed with the same key).
Run:  TOOLS=... python3 build_apk.py   ->  ../../dist/TheZombies.apk
"""
import os, sys, shutil, subprocess, zipfile, struct, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
T = os.environ.get('TOOLS', '/tmp/apkt')
AAPT2 = os.path.join(T, 'aaptjs3/package/bin/x64/linux/aapt2'); AJAR = os.path.join(T, 'ap/android-33/android.jar')
SMALI_CP = os.path.join(T, '_specs-feup_alpakka/package/java-binaries/*'); SIGNER = os.path.join(T, 'signer')
VER = os.environ.get('VER', '4.2.0'); VCODE = os.environ.get('VCODE', '42')
OUT = os.path.join(ROOT, 'dist', 'TheZombies.apk')
def run(*a, **k): print('$', ' '.join(a)); subprocess.run(a, check=True, **k)
w = tempfile.mkdtemp(prefix='tzapk')
# 1) game files -> assets/www
www = os.path.join(w, 'assets', 'www'); os.makedirs(www)
shutil.copy(os.path.join(ROOT, 'index.html'), www); shutil.copy(os.path.join(ROOT, 'manifest.webmanifest'), www)
for d in ['css', 'js', 'fonts', 'assets', 'sounds']:
    if os.path.isdir(os.path.join(ROOT, d)): shutil.copytree(os.path.join(ROOT, d), os.path.join(www, d))
# 2) resources + manifest
run(AAPT2, 'compile', '--dir', os.path.join(HERE, 'res'), '-o', os.path.join(w, 'res.zip'))
run(AAPT2, 'link', '-o', os.path.join(w, 'base.apk'), '-I', AJAR, '--manifest', os.path.join(HERE, 'AndroidManifest.xml'),
    '-A', os.path.join(w, 'assets'), os.path.join(w, 'res.zip'), '--min-sdk-version', '24', '--target-sdk-version', '33',
    '--version-code', VCODE, '--version-name', VER, '-0', 'png', '-0', 'woff2')
# 3) code
run('java', '-cp', SMALI_CP, 'com.android.tools.smali.smali.Main', 'assemble', '--api', '24', '-o', os.path.join(w, 'classes.dex'), os.path.join(HERE, 'smali'))
# 4) repack with classes.dex, 4-byte aligned stored entries (zipalign)
src = zipfile.ZipFile(os.path.join(w, 'base.apk'))
items = [(i, src.read(i.filename)) for i in src.infolist()]
items.insert(0, (zipfile.ZipInfo('classes.dex', (2008, 1, 1, 0, 0, 0)), open(os.path.join(w, 'classes.dex'), 'rb').read()))
items[0][0].compress_type = zipfile.ZIP_DEFLATED
aligned = os.path.join(w, 'aligned.apk')
with zipfile.ZipFile(aligned, 'w') as z:
    for info, data in items:
        zi = zipfile.ZipInfo(info.filename, info.date_time); zi.compress_type = info.compress_type; zi.external_attr = info.external_attr
        if zi.compress_type == zipfile.ZIP_STORED:
            off = z.fp.tell() + 30 + len(zi.filename.encode())
            pad = (-off) % 4
            zi.extra = b'\x00' * pad
        z.writestr(zi, data)
# 5) sign (v1 + v2 + v3)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
run('node', os.path.join(HERE, 'sign.mjs'), aligned, OUT, os.path.join(HERE, 'keys', 'key.pem'), os.path.join(HERE, 'keys', 'cert.pem'), cwd=SIGNER if os.path.isdir(SIGNER) else HERE,
    env=dict(os.environ, NODE_PATH=os.path.join(SIGNER, 'node_modules')))
print('APK:', OUT, os.path.getsize(OUT) // 1024, 'KB')
