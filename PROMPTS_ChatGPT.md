# Картинки для страницы Steam — промпты для ChatGPT

Сама игра в картинках не нуждается: вся графика рисуется кодом. Картинки нужны только для страницы магазина Steam.
Отправляйте промпты в ChatGPT по одному. ChatGPT не всегда попадает в точный размер, поэтому потом обрежьте картинку
до нужного размера (например, в Photopea или Paint.NET). Готовые файлы положите в папку `assets/steam/`.

Размеры по требованиям Steam ([документация Steamworks](https://partner.steamgames.com/doc/store/assets)):

| Файл | Размер | Что на нём |
|---|---|---|
| header_capsule.png | 920×430 | арт + логотип |
| small_capsule.png | 462×174 | арт + крупный логотип |
| main_capsule.png | 1232×706 | арт + логотип |
| vertical_capsule.png | 748×896 | арт + логотип |
| library_capsule.png | 600×900 | арт + логотип |
| library_hero.png | 3840×1240 | только арт, без текста |
| library_logo.png | 1280×720, прозрачный фон | только логотип |
| page_background.png | 1438×810 | тёмный приглушённый арт |

Скриншоты (минимум 5, 1920×1080) снимайте прямо из игры: F11 → полный экран → клавиша PrtSc.

---

## Общий стиль (вставляйте в начало каждого промпта)

```
Style: high-quality isometric pixel art, 2:1 isometric projection, crisp pixels, limited warm palette,
late autumn, orange/red/yellow foliage, post-apocalyptic Eastern European countryside, ruined brick
houses, rusty Soviet-era cars, dusk lighting with warm campfire and torch glow against cold blue shadows.
No photorealism, no 3D render, no anime.
```

## 1. Главная капсула (main capsule, 1232×706)

```
[Общий стиль] Wide horizontal key art, 16:9. A fortified survivor camp seen from above at dusk:
a ring of sharpened wooden log palisade walls, a crackling campfire in the center, wall torches,
a workbench, a small vegetable garden and an improvised auto-turret. A lone survivor in an olive
jacket, cap and backpack stands on guard aiming an AK rifle. Outside the walls a massive horde of
pale green-skinned zombies with glowing red eyes, torn bloody clothes and outstretched arms pushes
against the palisade; one huge hulking brute zombie smashes a wall. Burned-out bus and police car on
the cracked highway nearby. Leave the upper-left third calmer for a logo. Text "THE ZOMBIES" as a
chunky blocky pixel-font logo, bone-white letters dripping into blood red at the bottom, black outline.
```

## 2. Заголовок (header capsule, 920×430) и капсула библиотеки шапкой

```
[Общий стиль] Horizontal banner 2.14:1. Close view of the palisade wall at night lit by torches,
the survivor in olive jacket firing a shotgun over the logs, muzzle flash, zombie hands and red eyes
reaching over the wall from the dark. Big readable logo "THE ZOMBIES" on the right half: blocky
pixel letters, bone-white fading to blood red, thick black outline, slight red glow.
```

## 3. Маленькая капсула (small capsule, 462×174)

```
[Общий стиль] Very wide small banner. Minimal composition: dark background with orange campfire
glow, silhouettes of zombies on both sides, and a huge bold logo "THE ZOMBIES" filling most of the
image — must stay readable at tiny size. Blocky pixel font, bone-white to blood red, black outline.
```

## 4. Вертикальная капсула (vertical capsule, 748×896) и капсула библиотеки (600×900)

```
[Общий стиль] Vertical poster 2:3. Bottom: the wooden palisade camp with campfire and torches,
the survivor team (a woman medic with a red cross armband, a bearded old man with a hunting rifle,
a mechanic in an orange vest) defending it. Middle and top: an endless horde of zombies pouring out
of an autumn forest and ruined town under a dark orange sky, a rescue helicopter with a red cross
on the door flying in the distance. Logo "THE ZOMBIES" at the top, blocky pixel font,
bone-white to blood red, black outline.
```

## 5. Фон библиотеки (library hero, 3840×1240) — БЕЗ текста

```
[Общий стиль] Ultra-wide panoramic scene 3.1:1, absolutely no text or logo. An isometric pixel-art
panorama of the whole map at dusk: highway with wrecked cars and a yellow bus on the left, a ruined
town with brick and plaster houses, a gas station with red pumps, a military checkpoint with sandbags,
an autumn forest, and in the center a lit survivor camp surrounded by palisade walls under attack by
a zombie horde. Keep the center-left area slightly darker so a logo can sit on top.
```

## 6. Логотип (library logo, 1280×720, прозрачный фон)

```
Game logo only, transparent background (PNG with alpha). Text "THE ZOMBIES": small spaced-out
"THE" above, huge "ZOMBIES" below. Chunky blocky pixel-art lettering, bone-white at the top fading
into dripping blood red at the bottom, thick black pixel outline, subtle red glow, small blood drips
from the letters. No other elements, no background.
```

## 7. Фон страницы магазина (page background, 1438×810)

```
[Общий стиль] Dark, low-contrast, very muted background art: misty autumn forest at night, faint
silhouettes of zombies between trees, a distant warm campfire glow. Mostly dark (deep blue-black and
brown), no bright areas, no text. It must not distract from text on top of it.
```

---

### Совет
Если ChatGPT нарисовал персонажа или зомби не так, как в игре, приложите к промпту скриншот из игры
и допишите: «Match the character designs and colors from the attached screenshot».
