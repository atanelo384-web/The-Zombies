# Собирает всю игру в один HTML-файл (шрифты и скрипты встроены). Запуск: python build/make_single.py
import re, base64, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
html = open('index.html', encoding='utf-8').read()
css = open('css/style.css', encoding='utf-8').read()
def font(m):
    p = os.path.normpath(os.path.join('css', m.group(1)))
    return "url(data:font/woff2;base64," + base64.b64encode(open(p, 'rb').read()).decode() + ")"
css = re.sub(r"url\((\.\./fonts/[^)]+)\)", font, css)
css = css.replace("html, body {", "html, body { color-scheme: dark;", 1)
scripts = re.findall(r'<script src="(js/[^"]+)"></script>', html)
js = "\n".join(open(s, encoding='utf-8').read() for s in scripts)
body = html[html.index('<body>') + 6: html.index('<script src=')]
icon = 'data:image/png;base64,' + base64.b64encode(open('assets/icon.png', 'rb').read()).decode()
metas = '\n'.join(m for m in re.findall(r'<meta [^>]+>', html[:html.index('</head>')]))
out = ('<!doctype html>\n<html lang="ru">\n<head>\n' + metas + '\n'
       '<title>The Zombies</title>\n<link rel="icon" href="' + icon + '">\n<style>\n' + css + '\n</style>\n</head>\n<body>\n' + body +
       '<script>\n' + js.replace('</script', '<\\/script') + '\n</script>\n</body>\n</html>\n')
os.makedirs('dist', exist_ok=True)
open('dist/TheZombies.html', 'w', encoding='utf-8').write(out)
print('dist/TheZombies.html', round(len(out) / 1024), 'KB')
