// Copies the game (index.html, css, js, fonts, assets, sounds) from the project root into mobile/www
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..'), www = join(here, '..', 'www');
rmSync(www, { recursive: true, force: true }); mkdirSync(www, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest']) cpSync(join(root, f), join(www, f));
for (const d of ['css', 'js', 'fonts', 'assets', 'sounds']) if (existsSync(join(root, d))) cpSync(join(root, d), join(www, d), { recursive: true });
console.log('Игра скопирована в mobile/www');
