# The Zombies — handoff for Claude Code

Read this whole file first. It is everything a new session needs to continue the project.
**Talk to the owner in Russian.** The owner is a solo developer, not a programmer; explain steps
in plain words, short, and do the work yourself whenever you can.

## What the project is
"The Zombies" — isometric pixel-art zombie survival (plain JavaScript, no framework, no build step).
Version **5.0.0**. Runs in a browser, on PC (Electron), Android (WebView APK / Capacitor) and iPhone (Capacitor IPA).
GitHub: https://github.com/atanelo384-web/The-Zombies (public, branch `main`). CI builds Android, iPhone and
Windows on every push and publishes them as releases:
- https://github.com/atanelo384-web/The-Zombies/releases/download/win-latest/TheZombies-Setup-5.0.0.exe
- https://github.com/atanelo384-web/The-Zombies/releases/download/android-latest/TheZombies-android.apk
- https://github.com/atanelo384-web/The-Zombies/releases/download/ios-latest/TheZombies-unsigned.ipa
(`.github/workflows/build-mobile.yml`; iPhone IPA is unsigned — players install it free with Sideloadly.)

## Layout
| Path | What |
| --- | --- |
| `index.html`, `css/style.css`, `js/*.js` | the game. Global namespace `TZ`. Scripts load in the order listed at the end of index.html |
| `js/rules.js` | shared rules used by BOTH game and server: achievements, ranks, daily tasks, 21 classes, shop products, anti-cheat rate limits, cosmetics |
| `js/online.js` | session, API calls, progress queue → `/api/progress`, live notifications WebSocket `/ws`, skin loading |
| `js/social.js` | login screen, notifications (`TZ.notify`), friends/messages/clan window, multiplayer screen, shop, support |
| `js/classes.js` | class perks (`TZ.myPerk`, `TZ.perkOf`, `TZ.perkDmg`), custom skins (64×64 PNG unfolded "cross" layout) |
| `js/account.js` | accounts: ONLINE (server is the source of truth) or GUEST (local only, no multiplayer/shop); cosmetics drawing |
| `js/net.js` | multiplayer: host-authoritative game; `RelayHost`/`RelayClient` talk through the server relay `/relay` |
| `js/clans.js` | clans inside a world (read from player profiles; clans themselves live on the server) |
| `js/i18n.js`, `js/lang/*.js` | 11 languages: dictionaries "Russian text → translation"; DOM is auto-translated by a MutationObserver |
| `js/config.js` | `TZ.SERVER_URL` — the online server address baked into apps (empty = game asks for it) |
| `server/` | Node 22.13+ server: REST API, WebSockets (`/ws` notifications, `/relay` game rooms), serves `site/` at `/` and the game at `/play/` |
| `server/lib/` | `accounts.js` (auth, sessions, password reset codes, Google/Apple JWT, device-code login for apps, progress anti-cheat, classes, kits, skins), `social.js` (friends, DMs, blocks, clans + chat), `realtime.js` (presence, relay, speed/teleport anti-cheat, PvP elo, public-server worlds), `shop.js` (YooMoney quickpay + HTTP notifications, servers management, support tickets, admin), `db.js` (built-in `node:sqlite`), `backup.js` (snapshots to Google Drive via Apps Script, or Turso), `mail.js`, `config.js` (config.json or env vars), `util.js` |
| `server/deploy/` | `install.sh` (one-command Ubuntu VPS install with nginx + HTTPS), `google-script.gs` (free Gmail mail + Google Drive DB backup) |
| `render.yaml` | free hosting blueprint for Render.com |
| `site/` | official website (pixel style, 11 languages, servers list, donate, profile, clans, support, admin panel, `#/device/CODE` login confirmation for apps). No inline scripts (CSP) |
| `electron/` | PC app (`npm start`; installer built by CI) |
| `mobile/` | Capacitor project (Android + iOS) used by CI; `mobile/apk-lite/` = small APK built without Gradle (`build_apk.py`, needs tools, see its header; signing keys in `mobile/apk-lite/keys/` — NEVER commit them, they are in .gitignore) |

## Main features (all done and tested in 5.0)
Accounts (e-mail + password, Google, Apple, guest), unique 8-char player ID, password reset by e-mail code,
friends + requests + private messages + blocks, game invites, clans on the server (roles, chat, settings),
playing with friends anywhere through the server relay (host opens a world: friends / invite-only / code),
public servers (bought for 400 ₽ **only on the website**; first player hosts, world saved on the server, host
migration), YooMoney donations (kits, coins, classes, Legion cosmetics, servers), 21 classes with real perks,
coins (achievements, daily tasks, nights, boss), custom skins, server-side anti-cheat (progress rate buckets,
replay protection, speedhack/teleport kicks, reports, suspicion score), support tickets with admin replies,
admin panel on the site, 11 languages, automatic phone/PC detection (no manual switch), no Exit button on phones.

## Current state / what is NOT done yet (continue here)
1. **The server is not deployed yet.** The owner has no money. Chosen plan — completely free:
   - Google Apps Script: paste `server/deploy/google-script.gs` into script.google.com (owner's Google account,
     he has 5 TB Drive), set `SECRET`, deploy as Web app (Execute as me, access Anyone) → URL `…/exec`.
     It sends e-mail codes from Gmail AND stores DB snapshots in Drive folder `TheZombies-backup`.
   - Render.com (free, sign in with GitHub) → New → Blueprint → repo The-Zombies → fill env:
     `ADMIN_EMAILS` (owner e-mail: atanelo384@gmail.com unless he says otherwise), `GOOGLE_SCRIPT_URL`, `GOOGLE_SCRIPT_SECRET`.
     Free Render sleeps after 15 min idle (~1 min wake-up); disk is wiped on restart — that is why `backup.js`
     restores the DB from Drive on start and saves every 2 min + on SIGTERM. Render free blocks SMTP → mail goes via the script.
   - Alternative paid path (Beget VPS): `bash server/deploy/install.sh domain email`.
   Full Russian instructions for the owner: doc "The Zombies 5.0 — запуск сервера, сайта и оплаты"
   (https://claude.ai/code/artifact/8f72944a-07e5-4854-97c0-bc1db92a8a9f).
2. **YooMoney** (owner wants you to do it in his browser): wallet number is **4100119626166671** (already in `render.yaml`); on
   https://yoomoney.ru/transfer/myservices/http-notification set URL `https://<server>/api/pay/yoomoney`,
   enable notifications, copy the secret → env `YOOMONEY_SECRET` on Render (or config.json).
   The owner must type passwords / SMS codes himself. Never make payments.
3. **Website on Beget (owner's choice)**: Beget FREE plan hosts only the static site (copy the CONTENTS of `site/`
   into the Beget site folder `public_html`), with `window.TZ_API = '<Render URL>'` in `site/js/config.js`. The Node
   server (API, WebSockets, payments) stays on Render; DB lives on Google Drive. Server CORS already allows any origin.
   Payment links use the server's `publicUrl`, so they still work.
4. **Nice domain**: owner finds `*.onrender.com` ugly. Plan: free domain from DigitalPlat FreeDomain
   (`.qzz.io`, `.dpdns.org`, …) or eu.org → Render Custom Domain + CNAME. Then set `PUBLIC_URL` env.
5. **After the address is known**: set `TZ.SERVER_URL` in `js/config.js` to it, bump nothing else, push →
   CI rebuilds apps. Also rebuild `mobile/apk-lite` APK if needed (`VER=5.0.0 VCODE=50 python3 build_apk.py`).
6. Optional: Google sign-in needs `GOOGLE_CLIENT_ID` (Web OAuth client, origin = the site). Apple needs a paid
   Apple Developer account. Without them e-mail login works.

## How to run and test locally
```bash
cd server && npm install && node index.js       # creates config.json on first run; open http://localhost:8080
# test config: {"port":8080,"publicUrl":"http://localhost:8080","dataDir":"data","devShowCodes":true,"adminEmails":["admin@test.ru"]}
```
`devShowCodes` returns e-mail codes in API answers (tests only, never in production).
Game in the browser: http://localhost:8080/play/ . Site: http://localhost:8080/ .
Playwright + Chromium work well for UI tests (register via `TZ.Online.register`/`verify` with devCode,
`TZ.app.startRelayHost(meta, {access:'friends'})`, `TZ.app.joinRoom(room)`, `TZ.Menu.show('shop')`).

## Rules
- Commits: author `Claude <noreply@anthropic.com>`; never commit `mobile/apk-lite/keys/`, `server/config.json`, `server/data/`.
- New UI text: write it in Russian; for other languages add entries to `js/lang/<code>.js` (keys = exact Russian strings, `{n}` for numbers).
- Security: escape user text (`TZ.esc`), keep server validation (`server/lib/util.js` `v.*`), keep rate limits.
- Progress/RN/coins are decided by the server — never trust the client for them.
- The in-game "create server for 400 ₽" button was removed on purpose: servers are bought only on the website.
- The website must not have "play in browser" buttons (owner's request); the server-create button shows no price (price appears in the payment dialog).
