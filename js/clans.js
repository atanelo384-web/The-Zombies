// =====================================================================
//  THE ZOMBIES 5.0 — clans in the game world.
//  Clans live on the online server (name, tag, colour, PvP, markers,
//  members, chat). In a world the game only reads each player's clan from
//  their profile: members never hurt each other, peaceful clans don't fight,
//  clan tags are shown in chat, above heads and on the map.
// =====================================================================
'use strict';
(() => {
const P = TZ.Game.prototype;
TZ.CLAN_COLORS = ['#e04a3a', '#e8902a', '#e8d040', '#58c068', '#3cc0a8', '#40a8e8', '#4a6ae8', '#a060e0', '#e060a8', '#d8d8d0'];
const clanFor = (G, p) => { if (!p) return null; if (p === G.me) return TZ.Online.me && TZ.Account.isOnline() ? TZ.Online.me.clan : null; return p.profile && p.profile.clan || null; };
P.clanOf = function (uid) {
  if (!uid) return null;
  let who = null; for (const p of this.players.values()) if (p.uid === uid) { who = p; break; }
  const c = clanFor(this, who); if (!c) return null;
  const members = []; for (const p of this.players.values()) { const k = clanFor(this, p); if (k && k.id === c.id) members.push(p.uid); }
  return { id: c.id, name: c.name, tag: c.tag, color: c.color, pvp: !!c.pvp, markers: c.markers !== false && c.markers !== 0, members, owner: null, names: {} };
};
P.sameClan = function (a, b) { const c = this.clanOf(a); return !!c && a !== b && c.members.includes(b); };
P.syncClans = function () { this.clansVer = (this.clansVer || 0) + 1; if (this.ui && this.ui.onClans) this.ui.onClans(this); };
P.clanCmd = function () { TZ.ClanUI.open(); };
P.clanAct = function () { }; // clans are managed by the online server now
P.clanTouchNames = function () { };
// clan rules for player-vs-player damage (true = blocked)
P.clanBlocksDamage = function (attackerPid, victim) {
  const a = this.players.get(attackerPid); if (!a || a === victim) return false;
  if (this.sameClan(a.uid, victim.uid)) return true;
  const ca = this.clanOf(a.uid), cv = this.clanOf(victim.uid);
  return !!((ca && !ca.pvp) || (cv && !cv.pvp));
};
TZ.ClanUI = {
  open() { if (TZ.Social) TZ.Social.open('clan'); },
  close() { const m = document.querySelector('#social'); if (m) m.classList.remove('show'); },
  toggle() { const m = document.querySelector('#social'); if (m && m.classList.contains('show')) this.close(); else this.open(); },
  render() { },
  invited() { },
};
// clan chat from the game: /c text
TZ.clanSay = async (text) => {
  if (!TZ.Account.isOnline()) return;
  try { await TZ.Online.post('/api/clans/messages', { text }); } catch (e) { TZ.game && TZ.game.ui && TZ.game.ui.chatMsg('', e.message, '#ff8a6a'); }
};
// tag helpers used by chat, name tags and the player list
TZ.clanTag = (G, uid) => { const c = G && G.clanOf ? G.clanOf(uid) : null; return c ? { name: c.tag || c.name, color: c.color, full: c.name } : null; };
})();
