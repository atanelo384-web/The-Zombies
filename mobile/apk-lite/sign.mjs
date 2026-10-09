// node sign.mjs in.apk out.apk key.pem cert.pem   (needs: npm i apk_sign_ts)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { ApkSigner, SigningKey } = require('apk_sign_ts');
const [, , inp, out, key, cert] = process.argv;
const signer = new ApkSigner({ signingKey: SigningKey.fromPEM(readFileSync(key, 'utf8'), readFileSync(cert, 'utf8')) });
const { signedApk } = await signer.sign(new Uint8Array(readFileSync(inp)));
writeFileSync(out, signedApk);
console.log('signed', out);
