// =====================================================================
//  THE ZOMBIES 2.0 — infinite chunked world
//  Terrain, biomes, roads and points of interest are pure functions of
//  the seed; only changes are stored (per-chunk modification lists).
// =====================================================================
'use strict';
(() => {
const CH = TZ.CH = 32;
const RS = 176; // road grid spacing
const TL = TZ.TILE = { GRASS: 0, GRASS2: 1, DIRT: 2, ROAD: 3, ROADLINE: 4, CONCRETE: 5, WOOD: 6, GRAVEL: 7, FOREST: 8, TILES: 9, ROADLINE2: 10, MUD: 11,
  SNOW: 12, SNOW2: 13, ICE: 14, WATER: 15, SHALLOW: 16, SAND: 17, CRACKED: 18, SWAMPGRASS: 19, ROAD_SNOW: 20, FIELD: 21, PLAINS: 22, ASH: 23, CARPET: 24, DUNE: 25, DUNE2: 26, SANDSTONE: 27 };
TZ.TILE_COUNT = 28;
const ROADS = new Set([TL.ROAD, TL.ROADLINE, TL.ROADLINE2, TL.ROAD_SNOW]);
TZ.isRoad = t => ROADS.has(t);
TZ.SOFT_GROUND = new Set([TL.SNOW, TL.SNOW2]);
const H = TZ.hash;

// ---------------------------------------------------------------- object metadata
// solid: blocks movement; tall: blocks bullets/sight (fades when player behind)
const OBJ = TZ.OBJ = {
  hwall: { solid: 1, tall: 1 },
  pine: { solid: 1, tall: 1, tree: 1, hp: 6 }, spine: { solid: 1, tall: 1, tree: 1, hp: 6 }, oak: { solid: 1, tall: 1, tree: 1, hp: 7 },
  apple: { solid: 1, tall: 1, tree: 1, hp: 7, loot: 'appletree', regrow: 1, search: 0.8 },
  dead: { solid: 1, tall: 1, tree: 1, hp: 4 }, sdead: { solid: 1, tall: 1, tree: 1, hp: 4 }, willow: { solid: 1, tall: 1, tree: 1, hp: 6 },
  bush: { solid: 0, loot: 'bush', regrow: 1, search: 0.7 }, dbush: { solid: 0 }, reeds: { solid: 0 },
  cactus: { solid: 1, tall: 1, hp: 3, cactus: 1 }, palm: { solid: 1, tall: 1, tree: 1, hp: 6 }, sandrock: { solid: 1, rock: 1, hp: 6 },
  rock: { solid: 1, rock: 1, hp: 6 }, srock: { solid: 1, rock: 1, hp: 6 }, ore: { solid: 1, rock: 1, hp: 8, ore: 1 },
  scrap: { solid: 0, loot: 'trash', search: 1.2 }, hole: { solid: 0 }, stump: { solid: 0 }, bones: { solid: 0 },
  bus: { solid: 1, tall: 1, wreckable: 1 }, part: { solid: 1, tall: 1, isPart: 1 },
  wreck: { solid: 1, wreckable: 1 },
  crate: { solid: 1, loot: 'crate', search: 1.2 }, mcrate: { solid: 1, loot: 'military', search: 1.6 }, drop: { solid: 1, loot: 'drop', search: 2.0 },
  barrel: { solid: 1 }, cabinet: { solid: 1, loot: 'cabinet', search: 1.4 }, fridge: { solid: 1, loot: 'fridge', search: 1.2 },
  locker: { solid: 1, loot: 'locker', search: 1.5 }, dumpster: { solid: 1, loot: 'trash', search: 1.5 }, pump: { solid: 1, loot: 'shop', search: 1.5 },
  shelf: { solid: 1, loot: 'shop', search: 1.4 }, medcab: { solid: 1, loot: 'medical', search: 1.4 }, toolbox: { solid: 1, loot: 'garage', search: 1.5 },
  desk: { solid: 1, loot: 'lab', search: 1.5 }, hbed: { solid: 1 }, table: { solid: 1 }, hay: { solid: 1 }, tent: { solid: 1, loot: 'cabinet', search: 1.3 },
  barrier: { solid: 1 }, fence: { solid: 1 }, lamppost: { solid: 1, tall: 1 }, pole: { solid: 1, tall: 1 }, sign: { solid: 1 },
  corpse: { solid: 0, loot: 'locker', search: 1.0 }, backpack: { solid: 0, loot: 'crate', search: 1.0 }, tires: { solid: 1 }, helicrash: { solid: 1, tall: 1, loot: 'military', search: 2.2 },
};
for (const k in TZ.BUILD) { const B = TZ.BUILD[k]; OBJ[k] = { solid: B.solid ? 1 : 0, built: 1, gate: B.gate || null, floor: B.kind === 'floor' }; }

// ---------------------------------------------------------------- noise helpers
const fbm = TZ.fbm, noise2 = TZ.noise2;

class Chunk {
  constructor(cx, cy) {
    this.cx = cx; this.cy = cy; this.x0 = cx * CH; this.y0 = cy * CH;
    this.ground = new Uint8Array(CH * CH); this.decor = new Uint8Array(CH * CH); this.biome = new Uint8Array(CH * CH);
    this.obj = new Array(CH * CH).fill(null); this.ver = 0; this.roof = new Uint8Array(CH * CH);
  }
}

// layout used by POI generators (absolute world coordinates)
class Layout {
  constructor(poi, seed) { this.poi = poi; this.R = TZ.RNG((seed ^ (poi.hid * 2654435761)) >>> 0); this.g = new Map(); this.o = new Map(); this.rf = new Map(); this.spawns = []; this.clear = new Set(); this.n = 0; }
  k(x, y) { return x + ',' + y; }
  ground(x, y, t) { this.g.set(this.k(x, y), t); this.clear.add(this.k(x, y)); }
  fill(x0, y0, x1, y1, t) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.ground(x, y, t); }
  clearArea(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.clear.add(this.k(x, y)); }
  has(x, y) { return this.o.has(this.k(x, y)); }
  put(x, y, o) { if (this.has(x, y) || (this.rsv && this.rsv.has(this.k(x, y)))) return null; o.x = x; o.y = y; this.o.set(this.k(x, y), o); this.clear.add(this.k(x, y)); return o; }
  roof(x0, y0, x1, y1, code, holes = 0) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!(holes && H(x, y, 77) < holes)) this.rf.set(this.k(x, y), code); }
  spawn(x, y, kind, data = {}) { this.spawns.push(Object.assign({ id: this.poi.id + '#' + (this.n++), x, y, kind }, data)); }
}

class World {
  constructor(seed, opts = {}) {
    this.seed = seed >>> 0; this.s = this.seed % 100000;
    this.chunks = new Map(); this.mods = new Map(); // key -> Map(idx -> obj|null)
    this.roofMods = new Map(); this.roofVer = 0; // key -> Map(idx -> {c, o})
    this.spawned = new Set(); this.explored = new Set();
    this.pending = []; // spawn markers waiting for the game
    this.poiCache = new Map(); this.version = 0;
    this.heap = new TZ.Heap(4096);
    this._lc = null; this._lk = null;
    this.biomeOffset = opts.biomeOffset || this.findStartOffset();
  }
  key(cx, cy) { return cx + ',' + cy; }
  // buried caches for the metal detector: ~1 in 3 chunks, fixed by the seed
  cacheIn(cx, cy) {
    if (H(cx, cy, this.seed + 991) > 0.34) return null;
    const x = cx * CH + 3 + ((H(cx, cy, this.seed + 992) * (CH - 6)) | 0), y = cy * CH + 3 + ((H(cx, cy, this.seed + 993) * (CH - 6)) | 0);
    const g = this.groundIf(x, y); if (g == null || g === TL.WATER || g === TL.SHALLOW || g === TL.ICE || TZ.isRoad(g) || g === TL.CONCRETE || g === TL.WOOD || g === TL.TILES || g === TL.CARPET) return null;
    const o = this.get(x, y); if (o && o.t === 'hole') return { x, y, dug: 1 }; if (o && OBJ[o.t] && OBJ[o.t].solid) return null;
    return { x, y, dug: 0 };
  }
  nearestCache(x, y, rad = 14) {
    let best = null, bd = rad * rad; const cx0 = Math.floor(x / CH), cy0 = Math.floor(y / CH);
    for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) { if (!this.chunkIf(cx, cy)) continue; const c = this.cacheIn(cx, cy); if (!c || c.dug) continue; const d = dist2(x, y, c.x + .5, c.y + .5); if (d < bd) { bd = d; best = c; } }
    return best ? Object.assign(best, { d: Math.sqrt(bd) }) : null;
  }
  // ------------------------------------------------ biome / terrain functions
  findStartOffset() {
    // shift noise so that origin area is temperate forest
    for (let i = 0; i < 400; i++) {
      const ox = (H(i, 1, this.seed) - .5) * 20000 | 0, oy = (H(i, 2, this.seed) - .5) * 20000 | 0;
      this.biomeOffset = [ox, oy];
      let ok = 0; for (const [x, y] of [[40, 40], [90, 60], [0, 0], [-30, 30]]) if (this.biomeRaw(x, y) <= 1) ok++;
      if (ok === 4 && this.biomeRaw(60, 70) === 0) return [ox, oy];
    }
    return [0, 0];
  }
  biomeRaw(x, y) {
    const [ox, oy] = this.biomeOffset || [0, 0];
    const wx = x + ox + (noise2(x / 50, y / 50, this.s + 3) - .5) * 40, wy = y + oy + (noise2(x / 50 + 9, y / 50, this.s + 4) - .5) * 40;
    const t = fbm(wx / 330, wy / 330, this.s + 11), m = fbm(wx / 240 + 50, wy / 240, this.s + 23);
    if (t < 0.37) return 2;
    if (t > 0.6 && m < 0.37) return 5; // desert
    if (t > 0.63 && m < 0.47) return 4;
    if (m > 0.6) return 3;
    if (m > 0.46) return 0;
    return 1;
  }
  biomeAt(x, y) { const c = this.chunkIf(Math.floor(x / CH), Math.floor(y / CH)); if (c) return c.biome[((y - c.y0) | 0) * CH + ((x - c.x0) | 0)]; return this.biomeRaw(x | 0, y | 0); }
  lake(x, y) { return fbm(x / 64 + 300, y / 64, this.s + 37); }
  // road network --------------------------------------------------
  vx(i) { return i * RS + ((H(i, 77, this.seed) * 50) | 0) - 25; }
  hy(j) { return j * RS + ((H(j, 78, this.seed) * 50) | 0) - 25; }
  segH(i, j) { if (Math.abs(i) <= 1 && Math.abs(j) <= 1) return true; return H(i, j * 3 + 1, this.seed + 5) < 0.72; } // horizontal road j between vx(i)..vx(i+1)
  segV(i, j) { if (Math.abs(i) <= 1 && Math.abs(j) <= 1) return true; return H(i * 3 + 2, j, this.seed + 6) < 0.72; } // vertical road i between hy(j)..hy(j+1)
  cellOf(x, y) { let i = Math.floor(x / RS); if (x < this.vx(i)) i--; else if (x >= this.vx(i + 1)) i++; let j = Math.floor(y / RS); if (y < this.hy(j)) j--; else if (y >= this.hy(j + 1)) j++; return [i, j]; }
  roadAt(x, y) { // 0 none, 1 asphalt, 2 marking h, 3 marking v, 4 shoulder
    const [i, j] = this.cellOf(x, y);
    let hr = 0, vr = 0;
    for (const jj of [j, j + 1]) { if (!this.segH(i, jj)) continue; const d = y - this.hy(jj); if (d >= -3 && d <= 3) { const r = (d === -3 || d === 3) ? 4 : (d === 0 && ((x >> 1) & 1) === 0) ? 2 : 1; if (!hr || hr === 4) hr = r; } }
    for (const ii of [i, i + 1]) { if (!this.segV(ii, j)) continue; const d = x - this.vx(ii); if (d >= -3 && d <= 3) { const r = (d === -3 || d === 3) ? 4 : (d === 0 && ((y >> 1) & 1) === 0) ? 3 : 1; if (!vr || vr === 4) vr = r; } }
    const ha = hr && hr !== 4, va = vr && vr !== 4;
    if (ha && va) return 1;
    if (ha) return vr === 4 ? 1 : hr;
    if (va) return hr === 4 ? 1 : vr;
    return hr || vr;
  }
  // ------------------------------------------------ POIs
  poisForCell(i, j) {
    const key = i + ':' + j;
    let list = this._cellPois && this._cellPois.get(key);
    if (list) return list;
    if (!this._cellPois) this._cellPois = new Map();
    list = [];
    const R = TZ.RNG((this.seed * 31 + i * 92821 + j * 68917) >>> 0);
    const x0 = this.vx(i), x1 = this.vx(i + 1), y0 = this.hy(j), y1 = this.hy(j + 1);
    let hid = (i * 7919 + j * 104729) & 0xffffff;
    const add = (type, x, y, w, h, extra = {}) => { const b = this.biomeRaw(x + (w >> 1), y + (h >> 1)); list.push(Object.assign({ id: `${type}@${x},${y}`, hid: (hid++) * 13 + x * 3 + y, type, x, y, w, h, biome: b }, extra)); };
    // town at crossing (i,j)
    const crossing = (this.segH(i, j) || this.segH(i - 1, j)) && (this.segV(i, j) || this.segV(i, j - 1));
    if (crossing) {
      const b = this.biomeRaw(x0, y0);
      const ch = [0.55, 0.65, 0.42, 0.3, 0.38, 0.3][b];
      if ((i === 0 && j === 0) || R() < ch) add(b === 2 ? 'snowtown' : 'town', x0 - 46, y0 - 46, 92, 92, { cx: x0, cy: y0, ruined: b === 4 || b === 5, desert: b === 5 });
      else if (R() < 0.4) add('gas', x0 + 6, y0 + 6, 16, 12);
    }
    // roadside POIs along horizontal road j (segment i) and vertical road i (segment j)
    if (this.segH(i, j)) for (let k = 0; k < 2; k++) {
      if (R() > 0.55) continue;
      const t = x0 + 55 + R() * (x1 - x0 - 110) | 0, side = R() < .5 ? -1 : 1;
      const b = this.biomeRaw(t, y0);
      const type = pick(R, b === 5 ? [['gas', 3], ['junkyard', 2], ['oasis', 1], ['checkpoint', 1]] : b === 2 ? [['cabin', 3], ['gas', 2], ['checkpoint', 1], ['camp', 1]] : b === 4 ? [['junkyard', 3], ['gas', 2], ['checkpoint', 2]] : b === 1 ? [['farm', 4], ['gas', 2], ['checkpoint', 1], ['camp', 1], ['garage', 2]] : b === 3 ? [['stilts', 3], ['camp', 1], ['gas', 1]] : [['cabin', 2], ['gas', 2], ['garage', 2], ['camp', 2], ['checkpoint', 1]]);
      const S = POI_SIZE[type];
      add(type, t - (S[0] >> 1), side > 0 ? y0 + 5 : y0 - 5 - S[1], S[0], S[1], { side, road: 'h' });
    }
    if (this.segV(i, j)) for (let k = 0; k < 2; k++) {
      if (R() > 0.5) continue;
      const t = y0 + 55 + R() * (y1 - y0 - 110) | 0, side = R() < .5 ? -1 : 1;
      const b = this.biomeRaw(x0, t);
      const type = pick(R, b === 5 ? [['gas', 2], ['junkyard', 2], ['oasis', 1]] : b === 2 ? [['cabin', 3], ['gas', 1], ['camp', 1]] : b === 4 ? [['junkyard', 2], ['checkpoint', 2], ['gas', 1]] : b === 1 ? [['farm', 3], ['gas', 2], ['garage', 1]] : b === 3 ? [['stilts', 3], ['camp', 1]] : [['cabin', 2], ['gas', 2], ['garage', 1], ['camp', 1]]);
      const S = POI_SIZE[type];
      add(type, side > 0 ? x0 + 5 : x0 - 5 - S[0], t - (S[1] >> 1), S[0], S[1], { side, road: 'v' });
    }
    if (i === 0 && j === 0) add('start', 60, 64, 22, 20);
    // wild POIs inside the cell
    const nWild = 1 + (R() < 0.6 ? 1 : 0) + (R() < 0.3 ? 1 : 0);
    for (let k = 0; k < nWild; k++) {
      const px = x0 + 30 + R() * (x1 - x0 - 70) | 0, py = y0 + 30 + R() * (y1 - y0 - 70) | 0;
      const b = this.biomeRaw(px, py);
      const type = pick(R, [
        [['cabin', 3], ['camp', 2], ['helicrash', 1], ['lake', 2]],
        [['farm', 3], ['camp', 1], ['helicrash', 1], ['milbase', 1], ['airfield', 1]],
        [['cabin', 4], ['lab', 2], ['helicrash', 1], ['camp', 1]],
        [['stilts', 4], ['camp', 1], ['lab', 1]],
        [['junkyard', 3], ['milbase', 2], ['helicrash', 1], ['camp', 1]],
        [['oasis', 4], ['junkyard', 2], ['helicrash', 1], ['lab', 1], ['camp', 1]],
      ][b]);
      const S = POI_SIZE[type];
      if (type !== 'lake' && type !== 'stilts' && type !== 'oasis' && this.wetArea(px, py, S[0], S[1]) > 0.3) continue;
      if (list.some(p => p.x < px + S[0] + 8 && p.x + p.w + 8 > px && p.y < py + S[1] + 8 && p.y + p.h + 8 > py)) continue;
      add(type, px, py, S[0], S[1]);
    }
    // road junk along segments
    if (this.segH(i, j)) add('roadjunk', x0 + 8, y0 - 4, x1 - x0 - 16, 9, { dir: 'h', ry: y0 });
    if (this.segV(i, j)) add('roadjunk', x0 - 4, y0 + 8, 9, y1 - y0 - 16, { dir: 'v', rx: x0 });
    // drop pois overlapping roads or each other (except roadjunk/town)
    const out = [];
    for (const p of list) {
      if (p.type !== 'roadjunk' && p.type !== 'town' && p.type !== 'snowtown' && p.type !== 'start') {
        if (out.some(q => q.type !== 'roadjunk' && q.x < p.x + p.w + 4 && q.x + q.w + 4 > p.x && q.y < p.y + p.h + 4 && q.y + q.h + 4 > p.y)) continue;
        if (!p.road && this.poiHitsRoad(p)) continue;
      }
      out.push(p);
    }
    this._cellPois.set(key, out);
    if (this._cellPois.size > 200) this._cellPois.delete(this._cellPois.keys().next().value);
    return out;
  }
  wetArea(x, y, w, h) { let n = 0, m = 0; for (let yy = y; yy <= y + h; yy += 3) for (let xx = x; xx <= x + w; xx += 3) { m++; if (this.lake(xx, yy) > 0.7) n++; } return n / m; }
  poiHitsRoad(p) { for (let y = p.y - 1; y <= p.y + p.h + 1; y += 3) for (let x = p.x - 1; x <= p.x + p.w + 1; x += 3) if (this.roadAt(x, y)) return true; return false; }
  poisNear(x0, y0, x1, y1) {
    const out = [];
    const [ia, ja] = this.cellOf(x0, y0), [ib, jb] = this.cellOf(x1, y1);
    for (let j = ja - 1; j <= jb + 1; j++) for (let i = ia - 1; i <= ib + 1; i++) for (const p of this.poisForCell(i, j)) if (p.x <= x1 && p.x + p.w >= x0 && p.y <= y1 && p.y + p.h >= y0) out.push(p);
    return out;
  }
  layout(p) {
    let L = this.poiCache.get(p.id);
    if (L) return L;
    L = new Layout(p, this.seed);
    try { (GEN[p.type] || GEN.camp)(L, p, this); } catch (e) { console.error('poi gen', p.type, e); }
    this.poiCache.set(p.id, L);
    if (this.poiCache.size > 80) this.poiCache.delete(this.poiCache.keys().next().value);
    return L;
  }
  // terrain before POIs (also used for map previews of unloaded chunks)
  baseTile(x, y, b = this.biomeRaw(x, y), dry = null) {
    const s = this.s;
    const n = noise2(x / 7, y / 7, s + 1), n2 = noise2(x / 3.3, y / 3.3, s + 2);
    let t;
    if (b === 0) t = fbm(x / 22, y / 22, s) > 0.55 ? TL.FOREST : n > 0.66 ? TL.GRASS2 : n < 0.22 ? TL.DIRT : TL.GRASS;
    else if (b === 1) t = n > 0.7 ? TL.GRASS2 : n < 0.2 ? TL.DIRT : TL.PLAINS;
    else if (b === 2) t = n > 0.62 ? TL.SNOW2 : TL.SNOW;
    else if (b === 3) t = n > 0.55 ? TL.MUD : n2 > 0.7 ? TL.SHALLOW : TL.SWAMPGRASS;
    else if (b === 5) { const dn = Math.sin(x * 0.35 + y * 0.18 + noise2(x / 14, y / 14, s + 6) * 5); t = n2 > 0.78 ? TL.SANDSTONE : dn > 0.55 ? TL.DUNE2 : TL.DUNE; }
    else t = n > 0.6 ? TL.CRACKED : n < 0.25 ? TL.ASH : TL.SAND;
    const lk = this.lake(x, y);
    let lt = b === 3 ? 0.6 : b === 4 || b === 5 ? 2 : 0.71;
    const sd = Math.hypot(x - 71, y - 74); if (sd < 22) lt += (22 - sd) / 22 * 0.5; // keep the start camp on dry land
    if (dry) for (const p of dry) { const dx = Math.max(p.x - x, 0, x - p.x - p.w), dy = Math.max(p.y - y, 0, y - p.y - p.h), dd = Math.max(dx, dy); if (dd < 7) lt += (7 - dd) / 7 * 0.35; }
    if (lk > lt) t = b === 2 ? TL.ICE : (lk > lt + 0.035 ? TL.WATER : TL.SHALLOW);
    else if (lk > lt - 0.015 && b !== 2 && b !== 4 && b !== 5) t = b === 3 ? TL.MUD : TL.DIRT;
    const r = this.roadAt(x, y);
    if (r) t = r === 4 ? (b === 2 ? TL.SNOW2 : b === 5 ? TL.SAND : TL.GRAVEL) : r === 2 ? TL.ROADLINE : r === 3 ? TL.ROADLINE2 : b === 2 ? TL.ROAD_SNOW : TL.ROAD;
    if (r && b === 5 && r !== 2 && r !== 3 && noise2(x / 4, y / 4, s + 41) > 0.72) t = TL.DUNE; // sand drifts over desert roads
    return t;
  }
  // ------------------------------------------------ chunk generation
  chunkIf(cx, cy) { const k = cx + ',' + cy; if (k === this._lk) return this._lc; const c = this.chunks.get(k); if (c) { this._lk = k; this._lc = c; } return c || null; }
  chunk(cx, cy) { return this.chunkIf(cx, cy) || this.generate(cx, cy); }
  generate(cx, cy) {
    const c = new Chunk(cx, cy), x0 = c.x0, y0 = c.y0;
    const s = this.s;
    const pois = this.poisNear(x0 - 8, y0 - 8, x0 + CH + 7, y0 + CH + 7);
    const dry = pois.filter(p => p.type !== 'lake' && p.type !== 'stilts' && p.type !== 'roadjunk' && p.type !== 'oasis');
    // 1. base terrain
    for (let ly = 0; ly < CH; ly++) for (let lx = 0; lx < CH; lx++) {
      const x = x0 + lx, y = y0 + ly, i = ly * CH + lx;
      const b = this.biomeRaw(x, y); c.biome[i] = b;
      c.ground[i] = this.baseTile(x, y, b, dry);
    }
    // 2. POIs
    const clear = new Set();
    for (const p of pois) {
      if (p.x > x0 + CH - 1 || p.x + p.w < x0 || p.y > y0 + CH - 1 || p.y + p.h < y0) continue;
      const L = this.layout(p);
      for (const [k, t] of L.g) { const [x, y] = k.split(',').map(Number); if (x >= x0 && x < x0 + CH && y >= y0 && y < y0 + CH) c.ground[(y - y0) * CH + (x - x0)] = t; }
      const wet = p.type === 'lake' || p.type === 'stilts' || p.type === 'oasis';
      for (const k of L.clear) {
        clear.add(k);
        if (wet || L.g.has(k)) continue;
        const [x, y] = k.split(',').map(Number);
        if (x < x0 || x >= x0 + CH || y < y0 || y >= y0 + CH) continue;
        const i = (y - y0) * CH + (x - x0), g = c.ground[i];
        if (g === TL.WATER || g === TL.SHALLOW || g === TL.ICE) { const b = c.biome[i]; c.ground[i] = b === 2 ? TL.SNOW : b === 3 ? TL.MUD : b === 4 ? TL.SAND : TL.DIRT; }
      }
      for (const [k, o] of L.o) { const x = o.x, y = o.y; if (x >= x0 && x < x0 + CH && y >= y0 && y < y0 + CH) c.obj[(y - y0) * CH + (x - x0)] = Object.assign({}, o); }
      for (const [k, r] of L.rf) { const [x, y] = k.split(',').map(Number); if (x >= x0 && x < x0 + CH && y >= y0 && y < y0 + CH) c.roof[(y - y0) * CH + (x - x0)] = r; }
      for (const sp of L.spawns) if (sp.x >= x0 && sp.x < x0 + CH && sp.y >= y0 && sp.y < y0 + CH && !this.spawned.has(sp.id)) this.pending.push(sp);
    }
    // 3. vegetation & rocks
    for (let ly = 0; ly < CH; ly++) for (let lx = 0; lx < CH; lx++) {
      const x = x0 + lx, y = y0 + ly, i = ly * CH + lx;
      if (c.obj[i] || clear.has(x + ',' + y)) continue;
      const g = c.ground[i];
      if (ROADS.has(g) || g === TL.GRAVEL || g === TL.WATER || g === TL.ICE || g === TL.CONCRETE || g === TL.WOOD || g === TL.TILES) continue;
      if (Math.abs(x - 70) < 9 && Math.abs(y - 74) < 9) continue; // start clearing
      const b = c.biome[i], h = H(x, y, this.seed), h2 = H(x, y, this.seed + 1);
      const dens = fbm(x / 22, y / 22, s);
      let o = null;
      if (b === 0) { const p = dens > 0.55 ? 0.24 : dens > 0.45 ? 0.07 : 0.018; if (h < p) o = h2 < (dens > 0.6 ? 0.45 : 0.25) ? { t: 'pine', v: (h2 * 30 | 0) % 3 } : h2 > 0.94 ? { t: 'dead', v: 0 } : { t: 'oak', v: (h2 * 100 | 0) % 8 }; else if (h < p + 0.012) o = { t: 'rock', v: (h2 * 9 | 0) % 3 }; else if (h < p + 0.03) o = { t: 'bush', v: (h2 * 9 | 0) % 4 }; }
      else if (b === 1) { const p = dens > 0.62 ? 0.08 : 0.008; if (h < p) o = h2 < 0.25 ? { t: 'apple', v: 0 } : { t: 'oak', v: 3 + ((h2 * 9 | 0) % 3) }; else if (h < p + 0.006) o = { t: 'rock', v: (h2 * 9 | 0) % 3 }; else if (h < p + 0.02) o = { t: 'bush', v: (h2 * 9 | 0) % 4 }; }
      else if (b === 2) { const p = dens > 0.5 ? 0.2 : 0.05; if (h < p) o = h2 < 0.88 ? { t: 'spine', v: (h2 * 30 | 0) % 3 } : { t: 'sdead', v: 0 }; else if (h < p + 0.012) o = { t: h2 < 0.15 ? 'ore' : 'srock', v: (h2 * 9 | 0) % 3 }; }
      else if (b === 3) { if (g === TL.SHALLOW) { if (h < 0.18) o = { t: 'reeds', v: (h2 * 9 | 0) % 3 }; } else if (h < 0.07) o = h2 < 0.5 ? { t: 'willow', v: 0 } : { t: 'dead', v: 1 }; else if (h < 0.11) o = { t: 'reeds', v: (h2 * 9 | 0) % 3 }; else if (h < 0.115) o = { t: 'stump' }; }
      else if (b === 5) { if (h < 0.011) o = { t: 'cactus', v: (h2 * 9 | 0) % 3 }; else if (h < 0.02) o = { t: 'dbush', v: (h2 * 9 | 0) % 2 }; else if (h < 0.024) o = { t: 'bones' }; else if (h < 0.034) o = { t: 'sandrock', v: (h2 * 9 | 0) % 3 }; else if (h < 0.0365) o = { t: 'scrap', v: (h2 * 9 | 0) % 2 }; }
      else if (b === 4) { if (h < 0.012) o = { t: 'dead', v: (h2 * 9 | 0) % 2 }; else if (h < 0.03) o = { t: 'dbush', v: (h2 * 9 | 0) % 2 }; else if (h < 0.04) o = { t: 'rock', v: (h2 * 9 | 0) % 3 }; else if (h < 0.044) o = { t: 'ore', v: 0 }; else if (h < 0.05) o = { t: 'scrap', v: (h2 * 9 | 0) % 2 }; else if (h < 0.053) o = { t: 'bones', v: 0 }; }
      if (o) { o.x = x; o.y = y; c.obj[i] = o; }
    }
    // 4. decor
    for (let i = 0; i < CH * CH; i++) {
      const x = x0 + (i % CH), y = y0 + ((i / CH) | 0), g = c.ground[i], h = H(x, y, 999);
      let d = 0;
      if (g === TL.GRASS || g === TL.GRASS2 || g === TL.PLAINS) d = h < 0.16 ? 1 : h < 0.19 ? 4 : h < 0.21 ? 2 : h < 0.225 ? 3 : 0;
      else if (g === TL.FOREST) d = h < 0.3 ? 2 : h < 0.38 ? 1 : 0;
      else if (ROADS.has(g)) d = h < 0.07 ? 5 : h < 0.09 ? 6 : 0;
      else if (g === TL.DIRT || g === TL.SAND || g === TL.CRACKED) d = h < 0.1 ? 3 : h < 0.12 ? 5 : 0;
      else if (g === TL.SNOW || g === TL.SNOW2) d = h < 0.08 ? 8 : h < 0.1 ? 3 : 0;
      else if (g === TL.SWAMPGRASS || g === TL.MUD) d = h < 0.15 ? 9 : h < 0.2 ? 1 : 0;
      else if (g === TL.CONCRETE || g === TL.TILES || g === TL.WOOD) d = h < 0.05 ? 6 : h < 0.08 ? 5 : 0;
      c.decor[i] = d;
    }
    // 5. stored modifications
    const mods = this.mods.get(this.key(cx, cy));
    if (mods) for (const [i, o] of mods) c.obj[i] = o ? Object.assign({}, o) : null;
    const rm = this.roofMods.get(this.key(cx, cy)); if (rm) for (const [i, r] of rm) c.roof[i] = r.c;
    this.roofVer++;
    this.chunks.set(this.key(cx, cy), c);
    this.explored.add(this.key(cx, cy));
    this.version++;
    if (this.onChunk) this.onChunk(c);
    return c;
  }
  unload(cx, cy) { const k = this.key(cx, cy); const c = this.chunks.get(k); if (!c) return; this.chunks.delete(k); if (this._lk === k) { this._lk = null; this._lc = null; } if (this.onUnload) this.onUnload(c); }
  // ------------------------------------------------ tile access
  ground(x, y) { const c = this.chunk(Math.floor(x / CH), Math.floor(y / CH)); return c.ground[((y | 0) - c.y0) * CH + ((x | 0) - c.x0)]; }
  groundIf(x, y) { x |= 0; y |= 0; const c = this.chunkIf(Math.floor(x / CH), Math.floor(y / CH)); return c ? c.ground[(y - c.y0) * CH + (x - c.x0)] : -1; }
  get(x, y) { x = Math.floor(x); y = Math.floor(y); const c = this.chunkIf(Math.floor(x / CH), Math.floor(y / CH)); return c ? c.obj[(y - c.y0) * CH + (x - c.x0)] : null; }
  // ---- roofs: generated with buildings, or built by players
  roofAt(x, y) { x = Math.floor(x); y = Math.floor(y); const c = this.chunkIf(Math.floor(x / CH), Math.floor(y / CH)); return c ? c.roof[(y - c.y0) * CH + (x - c.x0)] : 0; }
  roofOwner(x, y) { const cx = Math.floor(x / CH), cy = Math.floor(y / CH), m = this.roofMods.get(this.key(cx, cy)); const r = m && m.get((y - cy * CH) * CH + (x - cx * CH)); return r ? r.o : null; }
  setRoof(x, y, code, owner) {
    x = Math.floor(x); y = Math.floor(y); const cx = Math.floor(x / CH), cy = Math.floor(y / CH), k = this.key(cx, cy), i = (y - cy * CH) * CH + (x - cx * CH);
    let m = this.roofMods.get(k); if (!m) { m = new Map(); this.roofMods.set(k, m); }
    m.set(i, { c: code, o: owner || null });
    const c = this.chunkIf(cx, cy); if (c) c.roof[i] = code;
    this.roofVer++;
  }
  roofChunkMods(cx, cy) { const m = this.roofMods.get(this.key(cx, cy)); return m ? [...m].map(([i, r]) => [i, r.c, r.o || 0]) : []; }
  applyRoofMods(cx, cy, arr) { if (!arr || !arr.length) return; const m = new Map(); for (const [i, c, o] of arr) m.set(i, { c, o: o || null }); this.roofMods.set(this.key(cx, cy), m); const ch = this.chunkIf(cx, cy); if (ch) for (const [i, r] of m) ch.roof[i] = r.c; this.roofVer++; }
  main(o) { if (o && o.ref) return this.get(o.ref[0], o.ref[1]); return o; }
  recordMod(x, y, o) {
    const cx = Math.floor(x / CH), cy = Math.floor(y / CH), k = this.key(cx, cy);
    let m = this.mods.get(k); if (!m) { m = new Map(); this.mods.set(k, m); }
    const i = (y - cy * CH) * CH + (x - cx * CH);
    m.set(i, o ? strip(o) : null);
  }
  set(x, y, o, silent) {
    x = Math.floor(x); y = Math.floor(y);
    const c = this.chunk(Math.floor(x / CH), Math.floor(y / CH));
    if (o) { o.x = x; o.y = y; const m = OBJ[o.t]; if (o.hp == null && m && m.hp) o.hp = m.hp; }
    c.obj[(y - c.y0) * CH + (x - c.x0)] = o; c.ver++;
    this.recordMod(x, y, o);
    this.version++;
    if (!silent && this.onChange) this.onChange(x, y, o);
    return o;
  }
  touch(o) { if (!o) return; this.recordMod(o.x, o.y, o); const c = this.chunkIf(Math.floor(o.x / CH), Math.floor(o.y / CH)); if (c) c.ver++; this.version++; if (this.onChange) this.onChange(o.x, o.y, o); }
  clearObj(x, y, silent) {
    const o = this.get(x, y); if (!o) return;
    if (o.parts) for (const [px, py] of o.parts) this.set(px, py, null, silent);
    this.set(x, y, null, silent);
  }
  solidFor(x, y, who, uid) {
    x = Math.floor(x); y = Math.floor(y);
    const c = this.chunkIf(Math.floor(x / CH), Math.floor(y / CH));
    if (!c) return true;
    const i = (y - c.y0) * CH + (x - c.x0);
    if (c.ground[i] === TL.WATER) return true;
    const o = c.obj[i]; if (!o) return false;
    const m = OBJ[o.t]; if (!m || !m.solid) return false;
    if (m.gate && who !== 'z') { if (m.gate !== 'code') return false; if (who === 'any') return false; return !TZ.gateAllows(o, uid); }
    return true;
  }
  slowAt(x, y) { const g = this.groundIf(x, y); return g === TL.SHALLOW ? 0.6 : g === TL.MUD ? 0.82 : g === TL.SNOW ? 0.88 : 1; }
  tallAt(x, y) { const o = this.get(x, y); if (!o) return false; const m = OBJ[o.t]; return !!m.tall && !m.built; }
  raycast(x0, y0, x1, y1, stopAtTrees = true) {
    const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(d * 3);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const o = this.main(this.get(x, y));
      if (o) { const m = OBJ[o.t]; if (m && m.tall && !m.built && (stopAtTrees || !m.tree)) return { t, o, x, y }; }
    }
    return null;
  }
  // ------------------------------------------------ windowed flow field (Dijkstra)
  // returns {x0,y0,n,f} : f[(y-y0)*n+(x-x0)] = cost to nearest source
  flowWindow(cx, cy, R, sources, mode) {
    const n = R * 2 + 1, x0 = Math.floor(cx) - R, y0 = Math.floor(cy) - R;
    const N = n * n;
    const cost = new Float32Array(N), f = new Float32Array(N).fill(1e9);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 + i, y = y0 + j, c = this.chunkIf(Math.floor(x / CH), Math.floor(y / CH));
      let v = 1;
      if (!c) v = -1;
      else {
        const k = (y - c.y0) * CH + (x - c.x0), g = c.ground[k], o = c.obj[k];
        if (g === TL.WATER) v = -1;
        else if (g === TL.SHALLOW) v = 1.8;
        if (o && v > 0) { const m = OBJ[o.t]; if (m && m.solid) { if (mode === 'z') v = (m.built && !o.wild) ? 6 + (o.hp || 100) / 35 : -1; else v = m.gate ? 1 : -1; } else if (o.t === 'spikes' || o.t === 'barbed') v = 4; }
      }
      cost[j * n + i] = v;
    }
    const heap = this.heap; heap.n = 0;
    for (const s of sources) { const i = Math.floor(s.x) - x0, j = Math.floor(s.y) - y0; if (i < 0 || j < 0 || i >= n || j >= n) continue; f[j * n + i] = 0; heap.push(j * n + i, 0); }
    while (heap.n > 0) {
      const id = heap.pop(), d = heap.lastV;
      if (d > f[id]) continue;
      const i = id % n, j = (id / n) | 0;
      for (let k = 0; k < 8; k++) {
        const ni = i + DX[k], nj = j + DY[k]; if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nid = nj * n + ni, c = cost[nid]; if (c < 0) continue;
        if (DX[k] && DY[k] && (cost[j * n + ni] !== 1 || cost[nj * n + i] !== 1)) continue;
        const nd = d + c * (DX[k] && DY[k] ? 1.414 : 1);
        if (nd < f[nid]) { f[nid] = nd; heap.push(nid, nd); }
      }
    }
    return { x0, y0, n, f, cost };
  }
  // ------------------------------------------------ save / load
  serialize() {
    const mods = {};
    for (const [k, m] of this.mods) { if (!m.size) continue; const arr = []; for (const [i, o] of m) arr.push([i, o || 0]); mods[k] = arr; }
    const roofs = {}; for (const [k, m] of this.roofMods) if (m.size) roofs[k] = [...m].map(([i, r]) => [i, r.c, r.o || 0]);
    return { seed: this.seed, off: this.biomeOffset, mods, roofs, spawned: [...this.spawned], explored: [...this.explored] };
  }
  chunkMods(cx, cy) { const m = this.mods.get(this.key(cx, cy)); if (!m) return []; const arr = []; for (const [i, o] of m) arr.push([i, o || 0]); return arr; }
  applyChunkMods(cx, cy, arr) {
    const k = this.key(cx, cy); const m = new Map(); for (const [i, o] of arr) m.set(i, o || null); this.mods.set(k, m);
    const c = this.chunkIf(cx, cy); if (c) { for (const [i, o] of m) c.obj[i] = o ? Object.assign({}, o) : null; c.ver++; this.version++; if (this.onChunk) this.onChunk(c, true); }
  }
  static load(d) {
    const w = new World(d.seed, { biomeOffset: d.off });
    for (const k in d.mods || {}) { const m = new Map(); for (const [i, o] of d.mods[k]) m.set(i, o || null); w.mods.set(k, m); }
    for (const k in d.roofs || {}) { const m = new Map(); for (const [i, c, o] of d.roofs[k]) m.set(i, { c, o: o || null }); w.roofMods.set(k, m); }
    for (const id of d.spawned || []) w.spawned.add(id);
    for (const k of d.explored || []) w.explored.add(k);
    return w;
  }
}
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
const strip = o => { const c = {}; for (const k in o) if (k[0] !== '_') c[k] = o[k]; return c; };
TZ.stripObj = strip;
const pick = (R, arr) => { let t = 0; for (const a of arr) t += a[1]; let r = R() * t; for (const a of arr) { r -= a[1]; if (r <= 0) return a[0]; } return arr[0][0]; };
TZ.World = World; TZ.RS = RS;

// gate access rule (shared by everyone)
TZ.gateAllows = (o, uid) => { if (!o || !TZ.isCode(o.t)) return true; if (!uid) return false; return o.owner === uid || (o.allow && o.allow.includes(uid)); };

// =====================================================================
//  POI GENERATORS
// =====================================================================
const POI_SIZE = { gas: [16, 12], cabin: [12, 10], checkpoint: [18, 14], camp: [14, 12], farm: [26, 22], garage: [16, 12], junkyard: [24, 20], stilts: [24, 20], helicrash: [12, 12], lake: [16, 14], airfield: [46, 26], milbase: [30, 26], lab: [20, 16], start: [22, 20], oasis: [18, 16] };
const SNOWB = 2;

function house(L, x0, y0, w, h, o = {}) {
  const R = L.R, x1 = x0 + w - 1, y1 = y0 + h - 1;
  const mat = o.mat ?? R.int(0, 3), floor = o.floor ?? (R.chance(0.6) ? TL.WOOD : TL.TILES);
  L.fill(x0, y0, x1, y1, floor);
  const door = o.door || 'bottom';
  const doors = new Set();
  const dx = door === 'right' ? x1 : door === 'left' ? x0 : x0 + (w >> 1), dy = door === 'top' ? y0 : door === 'bottom' ? y1 : y0 + (h >> 1);
  doors.add(dx + ',' + dy);
  if (o.doors2) doors.add((x0 + (w >> 1)) + ',' + (door === 'top' ? y1 : y0));
  const ruinAmt = o.ruin ?? 0.25;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!(x === x0 || x === x1 || y === y0 || y === y1)) continue;
    if (doors.has(x + ',' + y)) continue;
    if (R.chance(ruinAmt * 0.1) && !((x === x0 || x === x1) && (y === y0 || y === y1))) { L.ground(x, y, TL.DIRT); continue; }
    let win = 0;
    if (y === y1 && x !== x0 && x !== x1 && R.chance(0.35)) win = 1;
    if (x === x1 && y !== y0 && y !== y1 && R.chance(0.35)) win = 2;
    L.put(x, y, { t: 'hwall', m: mat, v: R.int(0, 3), win, ruin: R.chance(ruinAmt) ? 1 : 0, snow: o.snow ? 1 : 0 });
  }
  // interior partition for big houses
  let gap = null;
  if (w >= 10 && h >= 8 && o.rooms !== false) {
    let px = x0 + (w >> 1);
    if ((door === 'top' || door === 'bottom' || o.doors2) && Math.abs(px - dx) <= 1) px = dx - 2 > x0 + 2 ? dx - 2 : dx + 2; // the partition must not stand in front of a door
    const gy = y0 + (h >> 1); gap = { x: px, y: gy };
    for (let y = y0 + 1; y < y1; y++) if (y !== gy) L.put(px, y, { t: 'hwall', m: mat, v: R.int(0, 3), win: 0, ruin: 0, snow: o.snow ? 1 : 0 });
  }
  // porch: nothing (trees, bushes, junk) may grow right outside the door
  const ox = door === 'right' ? 1 : door === 'left' ? -1 : 0, oy = door === 'bottom' ? 1 : door === 'top' ? -1 : 0;
  L.rsv = L.rsv || new Set();
  for (let k = 1; k <= 2; k++) { L.clearArea(dx + ox * k - (oy ? 1 : 0), dy + oy * k - (ox ? 1 : 0), dx + ox * k + (oy ? 1 : 0), dy + oy * k + (ox ? 1 : 0)); L.rsv.add(L.k(dx + ox * k, dy + oy * k)); for (const [a, b] of [[dx + ox * k, dy + oy * k]]) { const k2 = L.k(a, b); if (L.o.has(k2) && L.o.get(k2).t !== 'hwall') L.o.delete(k2); } }
  L.clearArea(dx - ox, dy - oy, dx - ox, dy - oy);
  // roof: style follows the building material and the biome
  const bio = L.poi.biome, rc = o.roof ?? (o.snow || bio === 2 ? 7 : bio === 5 ? 9 : mat === 2 ? 4 : mat === 0 ? 1 : mat === 3 ? (R.chance(0.5) ? 3 : 8) : 2);
  if (rc) L.roof(x0, y0, x1, y1, rc, ruinAmt > 0.3 ? 0.12 : ruinAmt > 0.2 ? 0.05 : 0);
  return { x0: x0 + 1, y0: y0 + 1, x1: x1 - 1, y1: y1 - 1, dx, dy, gap, idx: dx - ox, idy: dy - oy };
}
function furnish(L, r, kinds) {
  const R = L.R;
  for (const k of kinds) {
    for (let tries = 0; tries < 24; tries++) {
      const side = R.int(0, 3); let x, y;
      if (side === 0) { x = R.int(r.x0, r.x1); y = r.y0; } else if (side === 1) { x = r.x0; y = R.int(r.y0, r.y1); } else if (side === 2) { x = r.x1; y = R.int(r.y0, r.y1); } else { x = R.int(r.x0, r.x1); y = r.y1; }
      if (L.has(x, y) || (Math.abs(x - r.dx) <= 1 && Math.abs(y - r.dy) <= 1)) continue;
      if (r.gap && Math.abs(x - r.gap.x) <= 1 && Math.abs(y - r.gap.y) <= 1) continue; // keep the doorway between rooms free
      // never seal off a free tile (a corner between two pieces of furniture)
      const inR = (u, v) => u >= r.x0 && u <= r.x1 && v >= r.y0 && v <= r.y1, free = (u, v) => inR(u, v) && !L.has(u, v) && !(u === x && v === y);
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => free(x + a, y + b) && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([c, d]) => free(x + a + c, y + b + d)))) continue;
      L.put(x, y, typeof k === 'string' ? { t: k, v: R.int(0, 2) } : Object.assign({ v: 0 }, k));
      break;
    }
  }
}
const zom = (L, x, y, n, mix) => L.spawn(x, y, 'zombies', { n, mix });
const surv = (L, x, y) => L.spawn(x, y, 'survivor');
const veh = (L, x, y, kind, a, st) => L.spawn(x, y, 'vehicle', { vk: kind, a: a ?? L.R() * 6.28, st: st || 'broken' });
const wildBiome = (p) => p.biome;

const GEN = {
  start(L, p) {
    const cx = p.x + 10, cy = p.y + 10;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) { const d = Math.hypot(x - cx, y - cy); if (d < 9) { if (d < 3) L.ground(x, y, TL.DIRT); else L.clearArea(x, y, x, y); } }
    L.put(cx - 2, cy - 2, { t: 'crate', v: 0, starter: 1, fixed: { wood: 8, cloth: 4, bandage: 2, water: 1, rope: 1 } });
    L.put(cx + 3, cy - 3, { t: 'crate', v: 0, starter: 1, fixed: { axe: 1, canned: 2, metal: 4, stone: 3 } });
    L.put(cx - 3, cy + 2, { t: 'corpse', starter: 1, fixed: { ammo9: 10, bandage: 1, energy: 1, bp_small: 1 } });
    L.put(cx + 2, cy + 4, { t: 'barrel', c: 0 });
    veh(L, cx + 5, cy + 2, 'hatch', 1.2, 'broken_start');
  },
  town(L, p, W) {
    const R = L.R, cx = p.cx, cy = p.cy, snow = p.biome === SNOWB, ruined = p.ruined;
    // sidewalks along the two roads
    for (let d = -44; d <= 44; d++) { for (const o of [-4, 4]) { if (W.roadAt(cx + d, cy + o) === 0) L.ground(cx + d, cy + o, snow ? TL.SNOW2 : TL.CONCRETE); if (W.roadAt(cx + o, cy + d) === 0) L.ground(cx + o, cy + d, snow ? TL.SNOW2 : TL.CONCRETE); } }
    // four quadrants of lots
    const special = ['police', 'shop', 'clinic', 'garage', 'shop', 'house', 'house', 'apt'];
    for (let k = special.length - 1; k > 0; k--) { const j = R.int(0, k); [special[k], special[j]] = [special[j], special[k]]; }
    let sp = 0;
    for (const [qx, qy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      for (const along of [0, 1]) { // lots along horizontal road (along=0) or vertical road (along=1)
        let t = 7;
        while (t < 42) {
          const w = R.int(7, 10), h = R.int(7, 9);
          const kind = sp < special.length && R() < 0.45 ? special[sp++] : 'house';
          let x0, y0, door;
          if (along === 0) { x0 = qx > 0 ? cx + t : cx - t - w; y0 = qy > 0 ? cy + 6 : cy - 6 - h; door = qy > 0 ? 'top' : 'bottom'; }
          else { y0 = qy > 0 ? cy + t : cy - t - h; x0 = qx > 0 ? cx + 6 : cx - 6 - w; door = qx > 0 ? 'left' : 'right'; }
          if (along === 1 && t < 18) { t += 4; continue; } // keep corner free
          t += (along === 0 ? w : h) + R.int(1, 3);
          if (R() < 0.12) { // park / parking lot
            L.fill(x0, y0, x0 + w - 1, y0 + h - 1, snow ? TL.SNOW2 : TL.CONCRETE);
            if (R() < 0.6) veh(L, x0 + (w >> 1), y0 + (h >> 1), R.pick(['sedan', 'hatch', 'pickup']), along ? 0 : Math.PI / 2);
            continue;
          }
          const ruin = ruined ? 0.6 : 0.22;
          if (kind === 'police') { const r = house(L, x0, y0, w, h, { door, mat: 2, floor: TL.TILES, ruin: 0.08, rooms: false }); furnish(L, r, ['locker', 'locker', 'locker', 'desk', { t: 'locker', quest: 'radiopart' }]); surv(L, r.x0 + 1, r.y0 + 1); zom(L, r.dx, r.dy, 6, 'police'); veh(L, x0 + (w >> 1), along ? y0 + h + 2 : (door === 'top' ? y0 - 2 : y0 + h + 1), 'police', 0, 'broken'); }
          else if (kind === 'shop') { const r = house(L, x0, y0, w, h, { door, mat: 1, floor: TL.TILES, ruin, rooms: false }); for (let yy = r.y0 + 1; yy < r.y1; yy += 2) for (let xx = r.x0 + 1; xx < r.x1; xx += 3) L.put(xx, yy, { t: 'shelf', v: R.int(0, 2) }); furnish(L, r, ['fridge', 'fridge', 'shelf']); zom(L, r.dx, r.dy, 3); }
          else if (kind === 'clinic') { const r = house(L, x0, y0, w, h, { door, mat: 2, floor: TL.TILES, ruin: 0.1, rooms: false }); furnish(L, r, ['medcab', 'medcab', { t: 'hbed' }, { t: 'hbed' }, 'medcab']); surv(L, r.x0 + 2, r.y0 + 1); zom(L, r.dx, r.dy, 5); }
          else if (kind === 'garage') { const r = house(L, x0, y0, w, h, { door, mat: 2, floor: TL.CONCRETE, ruin, rooms: false }); furnish(L, r, ['toolbox', 'toolbox', { t: 'tires' }, 'crate']); veh(L, (r.x0 + r.x1) >> 1, (r.y0 + r.y1) >> 1, R.pick(['pickup', 'uaz', 'sedan']), along ? Math.PI / 2 : 0, 'broken'); }
          else if (kind === 'apt') { const r = house(L, x0, y0, w + 2, h + 1, { door, mat: R.pick([0, 2]), ruin }); furnish(L, r, ['cabinet', 'fridge', 'cabinet', 'locker', { t: 'hbed' }, { t: 'hbed' }, 'table']); zom(L, r.dx, r.dy, 4); if (R() < 0.3) surv(L, r.x0 + 1, r.y1 - 1); }
          else { const r = house(L, x0, y0, w, h, { door, mat: snow ? 3 : undefined, ruin, snow }); furnish(L, r, [R.chance(0.7) ? 'cabinet' : 'locker', 'fridge', R.chance(0.6) ? 'cabinet' : 'crate', { t: 'hbed' }, 'table']); if (R() < 0.55) zom(L, r.dx, r.dy, R.int(1, 3)); if (R() < 0.08) surv(L, r.x0 + 1, r.y0 + 1); }
        }
      }
    }
    // street furniture
    for (let d = -40; d <= 40; d += 8) { if (!L.has(cx + d, cy - 4)) L.put(cx + d, cy - 4, { t: 'lamppost' }); if (!L.has(cx + 4, cy + d) && Math.abs(d) > 6) L.put(cx + 4, cy + d, { t: 'lamppost' }); }
    for (let k = 0; k < 6; k++) { const d = R.int(-40, 40); if (Math.abs(d) < 6) continue; if (R() < 0.5) veh(L, cx + d, cy + R.pick([-1, 1]), R.pick(['sedan', 'hatch', 'pickup', 'sedan']), R.chance(.5) ? 0 : Math.PI, R() < 0.35 ? 'wreck' : 'broken'); else veh(L, cx + R.pick([-1, 1]), cy + d, R.pick(['sedan', 'hatch']), Math.PI / 2, R() < 0.35 ? 'wreck' : 'broken'); }
    for (let k = 0; k < 5; k++) { const x = cx + R.int(-38, 38), y = cy + R.pick([-5, 5]); if (!L.has(x, y)) L.put(x, y, { t: 'dumpster', v: 0 }); }
    zom(L, cx, cy, 10); zom(L, cx + 20, cy, 6); zom(L, cx, cy + 20, 6); zom(L, cx - 20, cy - 3, 5);
  },
  snowtown(L, p, W) {
    const R = L.R, cx = p.cx, cy = p.cy;
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2 + R() * 0.3, d = R.range(14, 34);
      const w = R.int(6, 8), h = R.int(6, 7);
      const x0 = Math.round(cx + Math.cos(a) * d - w / 2), y0 = Math.round(cy + Math.sin(a) * d - h / 2);
      if (Math.abs(x0 + w / 2 - cx) < 9 || Math.abs(y0 + h / 2 - cy) < 9) continue;
      if (W.poiHitsRoad({ x: x0, y: y0, w, h })) continue;
      const r = house(L, x0, y0, w, h, { mat: 3, door: R.pick(['top', 'bottom', 'left', 'right']), snow: 1, ruin: 0.15, rooms: false });
      furnish(L, r, [k === 0 ? 'locker' : 'cabinet', R.chance(.5) ? 'fridge' : 'crate', { t: 'hbed' }, k === 1 ? { t: 'cabinet', loot: 'cabin' } : 'cabinet']);
      if (k === 2) { furnish(L, r, ['medcab']); surv(L, r.x0 + 1, r.y0 + 1); }
      if (k === 4) furnish(L, r, [{ t: 'locker', loot: 'police', quest: 'radiopart' }]);
      if (R() < 0.6) zom(L, r.dx, r.dy, R.int(2, 4), 'snow');
    }
    for (let k = 0; k < 3; k++) veh(L, cx + R.int(-20, 20), cy + R.pick([-1, 1]), R.pick(['uaz', 'snowmobile', 'pickup']), 0, 'broken');
    zom(L, cx, cy, 8, 'snow');
  },
  gas(L, p) {
    const R = L.R, x0 = p.x, y0 = p.y;
    L.fill(x0, y0, x0 + p.w - 1, y0 + p.h - 1, p.biome === SNOWB ? TL.SNOW2 : TL.CONCRETE);
    const r = house(L, x0 + 1, y0 + 1, 7, 6, { door: 'bottom', mat: 1, floor: TL.TILES, ruin: 0.15, rooms: false });
    furnish(L, r, ['shelf', 'fridge', 'shelf', 'cabinet']);
    for (let k = 0; k < 3; k++) L.put(x0 + 3 + k * 4, y0 + p.h - 3, { t: 'pump' });
    L.put(x0 + p.w - 2, y0 + 1, { t: 'sign' }); L.put(x0 + p.w - 3, y0 + 3, { t: 'barrel', c: 1 }); L.put(x0 + p.w - 2, y0 + 3, { t: 'barrel', c: 1 });
    veh(L, x0 + 11, y0 + 5, R.pick(['sedan', 'hatch', 'pickup']), R() * 6.28, 'broken');
    if (R() < 0.5) surv(L, r.x0 + 1, r.y0 + 1);
    zom(L, x0 + 7, y0 + p.h - 2, R.int(3, 6));
  },
  checkpoint(L, p) {
    const R = L.R, x0 = p.x, y0 = p.y;
    L.fill(x0, y0, x0 + p.w - 1, y0 + p.h - 1, TL.GRAVEL);
    const r = house(L, x0 + 1, y0 + 1, 8, 6, { door: 'bottom', mat: 2, floor: TL.CONCRETE, ruin: 0.1, rooms: false });
    furnish(L, r, ['locker', { t: 'mcrate', quest: 'radiopart' }, 'mcrate', { t: 'hbed' }]);
    for (let x = x0; x < x0 + p.w; x++) if (x % 3) L.put(x, y0 + p.h - 1, { t: 'sandbags', hp: 9999, wild: 1 });
    for (const [x, y] of [[x0 + 11, y0 + 3], [x0 + 12, y0 + 3], [x0 + 11, y0 + 4], [x0 + 15, y0 + 8]]) L.put(x, y, { t: 'mcrate', v: 1 });
    L.put(x0 + p.w - 2, y0 + 1, { t: 'floodlight', wild: 1, hp: 9999 });
    veh(L, x0 + 13, y0 + 8, 'uaz', 0, 'broken');
    surv(L, r.x0 + 1, r.y0 + 1);
    zom(L, x0 + 9, y0 + 9, 9, 'military');
  },
  milbase(L, p) {
    const R = L.R, x0 = p.x, y0 = p.y, x1 = x0 + p.w - 1, y1 = y0 + p.h - 1;
    L.fill(x0, y0, x1, y1, TL.CONCRETE);
    for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) if (!(y === y1 && Math.abs(x - (x0 + p.w / 2)) < 3)) L.put(x, y, { t: 'fence', v: 0 });
    for (let y = y0 + 1; y < y1; y++) for (const x of [x0, x1]) L.put(x, y, { t: 'fence', v: 1 });
    const r1 = house(L, x0 + 3, y0 + 3, 10, 8, { door: 'bottom', mat: 2, floor: TL.CONCRETE, ruin: 0.08 });
    furnish(L, r1, ['locker', 'locker', { t: 'hbed' }, { t: 'hbed' }, { t: 'mcrate', quest: 'radiopart' }, 'medcab']);
    const r2 = house(L, x0 + 16, y0 + 3, 11, 8, { door: 'bottom', mat: 2, floor: TL.CONCRETE, ruin: 0.08, rooms: false });
    furnish(L, r2, ['mcrate', 'mcrate', 'mcrate', 'toolbox', 'mcrate']);
    for (let k = 0; k < 5; k++) L.put(x0 + 4 + k * 2, y0 + 15, { t: 'mcrate', v: 1 });
    L.put(x0 + 2, y0 + 1, { t: 'floodlight', wild: 1, hp: 9999 }); L.put(x1 - 2, y0 + 1, { t: 'floodlight', wild: 1, hp: 9999 });
    veh(L, x0 + 20, y0 + 16, 'uaz', 0, 'broken'); veh(L, x0 + 24, y0 + 20, 'uaz', Math.PI / 2, 'wreck');
    if (R() < 0.35) veh(L, x0 + 9, y0 + 20, 'heli', R() * 6.28, 'broken'); // helipad
    surv(L, r1.x0 + 2, r1.y0 + 1);
    zom(L, x0 + 15, y0 + 14, 14, 'military'); zom(L, x0 + 8, y0 + 20, 6, 'military');
  },
  cabin(L, p) {
    const R = L.R, snow = p.biome === SNOWB;
    L.clearArea(p.x - 1, p.y - 1, p.x + p.w, p.y + p.h);
    const r = house(L, p.x + 2, p.y + 1, 7, 6, { mat: 3, floor: TL.WOOD, door: 'bottom', snow, ruin: 0.12, rooms: false });
    furnish(L, r, [{ t: 'cabinet', loot: 'cabin' }, { t: 'hbed' }, 'fridge', { t: 'locker', loot: 'cabin' }]);
    L.put(p.x + 1, p.y + p.h - 2, { t: 'campfire', hp: 9999, wild: 1, cold: 1 });
    for (let k = 0; k < 4; k++) L.put(p.x + 7 + (k % 2), p.y + p.h - 2 + (k >> 1) - 1, { t: 'stump' });
    if (R() < 0.6) surv(L, r.x0 + 1, r.y0 + 1);
    if (R() < 0.5) veh(L, p.x + p.w - 2, p.y + p.h - 2, snow ? 'snowmobile' : 'uaz', R() * 6.28, 'broken');
    zom(L, p.x + 5, p.y + p.h, R.int(1, 3), snow ? 'snow' : null);
    if (R() < 0.5) L.spawn(p.x + 5, p.y + p.h + 3, 'animals', { ak: snow ? 'wolf' : 'deer', n: snow ? 3 : 2 });
  },
  camp(L, p) {
    const R = L.R;
    L.clearArea(p.x, p.y, p.x + p.w, p.y + p.h);
    const cx = p.x + (p.w >> 1), cy = p.y + (p.h >> 1);
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (Math.hypot(x - cx, y - cy) < 3) L.ground(x, y, TL.DIRT);
    L.put(cx, cy, { t: 'campfire', hp: 9999, wild: 1, cold: 1 });
    for (let k = 0; k < 3; k++) { const a = k / 3 * 6.28 + R(); L.put(Math.round(cx + Math.cos(a) * 4), Math.round(cy + Math.sin(a) * 4), { t: 'tent', v: k % 3 }); }
    L.put(cx + 2, cy - 2, { t: 'crate' }); L.put(cx - 2, cy + 3, { t: 'barrel', c: 0 });
    // makeshift fence
    for (let a = 0; a < 40; a++) { if (a % 9 === 0) continue; const ang = a / 40 * Math.PI * 2; const x = Math.round(cx + Math.cos(ang) * 6), y = Math.round(cy + Math.sin(ang) * 5.5); if (!L.has(x, y)) L.put(x, y, { t: 'wall_wood', hp: 120, wild: 1, owner: 'npc' }); }
    surv(L, cx + 1, cy + 1); if (R() < 0.6) surv(L, cx - 1, cy - 1);
    zom(L, cx + 9, cy + 7, R.int(3, 6));
  },
  farm(L, p) {
    const R = L.R, x0 = p.x, y0 = p.y;
    L.clearArea(x0, y0, x0 + p.w, y0 + p.h);
    for (let y = y0 + 12; y < y0 + p.h - 1; y++) for (let x = x0 + 1; x < x0 + 14; x++) L.ground(x, y, (y % 2) ? TL.FIELD : TL.MUD);
    for (let x = x0; x <= x0 + 14; x++) { if (x !== x0 + 7) { L.put(x, y0 + 11, { t: 'fence', v: 0 }); L.put(x, y0 + p.h - 1, { t: 'fence', v: 0 }); } }
    const r = house(L, x0 + 1, y0 + 1, 11, 8, { mat: 3, floor: TL.WOOD, door: 'bottom', doors2: true, ruin: 0.2 });
    furnish(L, r, ['crate', 'crate', 'cabinet', { t: 'hay' }, { t: 'hay' }, 'toolbox']);
    const r2 = house(L, x0 + 16, y0 + 2, 8, 7, { mat: 1, door: 'bottom', ruin: 0.2 });
    furnish(L, r2, ['cabinet', 'fridge', { t: 'cabinet', quest: R() < 0.5 ? 'radiopart' : null }, { t: 'hbed' }, 'table']);
    for (let k = 0; k < 5; k++) L.put(x0 + 16 + R.int(0, 8), y0 + 11 + R.int(0, 8), { t: R() < .6 ? 'hay' : 'apple' });
    veh(L, x0 + 20, y0 + 13, 'pickup', R() * 6.28, 'broken');
    surv(L, r.x0 + 2, r.y0 + 2);
    zom(L, x0 + 7, y0 + 16, R.int(4, 7));
    if (R() < 0.5) L.spawn(x0 + 20, y0 + p.h + 4, 'animals', { ak: 'deer', n: 3 });
  },
  garage(L, p) {
    const R = L.R, x0 = p.x, y0 = p.y;
    L.fill(x0, y0, x0 + p.w - 1, y0 + p.h - 1, p.biome === SNOWB ? TL.SNOW2 : TL.CONCRETE);
    const r = house(L, x0 + 1, y0 + 1, 10, 8, { mat: 2, floor: TL.CONCRETE, door: p.side > 0 ? 'top' : 'bottom', ruin: 0.15, rooms: false });
    furnish(L, r, ['toolbox', 'toolbox', 'toolbox', { t: 'tires' }, { t: 'tires' }, 'shelf']);
    veh(L, (r.x0 + r.x1) >> 1, (r.y0 + r.y1) >> 1, R.pick(['pickup', 'sedan', 'uaz', 'hatch']), 0, 'broken');
    veh(L, x0 + 13, y0 + 4, R.pick(['sedan', 'hatch']), Math.PI / 2, R() < 0.5 ? 'wreck' : 'broken');
    zom(L, x0 + 6, y0 + p.h, R.int(2, 4));
  },
  junkyard(L, p) {
    const R = L.R, x0 = p.x, y0 = p.y;
    L.fill(x0, y0, x0 + p.w - 1, y0 + p.h - 1, TL.GRAVEL);
    for (let x = x0; x < x0 + p.w; x++) { if (Math.abs(x - x0 - 10) > 1) L.put(x, y0, { t: 'fence', v: 0 }); L.put(x, y0 + p.h - 1, { t: 'fence', v: 0 }); }
    for (let y = y0 + 1; y < y0 + p.h - 1; y++) { L.put(x0, y, { t: 'fence', v: 1 }); L.put(x0 + p.w - 1, y, { t: 'fence', v: 1 }); }
    for (let k = 0; k < 10; k++) veh(L, x0 + 3 + R.int(0, p.w - 6), y0 + 3 + R.int(0, p.h - 6), R.pick(['sedan', 'hatch', 'pickup', 'police', 'uaz']), R() * 6.28, R() < 0.7 ? 'wreck' : 'broken');
    for (let k = 0; k < 8; k++) { const x = x0 + 2 + R.int(0, p.w - 4), y = y0 + 2 + R.int(0, p.h - 4); if (!L.has(x, y)) L.put(x, y, R() < 0.5 ? { t: 'scrap', v: R.int(0, 1) } : { t: 'tires' }); }
    const r = house(L, x0 + p.w - 9, y0 + 2, 7, 6, { mat: 3, door: 'bottom', floor: TL.CONCRETE, rooms: false, ruin: 0.3 });
    furnish(L, r, ['toolbox', 'toolbox', 'locker']);
    if (R() < 0.5) surv(L, r.x0 + 1, r.y0 + 1);
    zom(L, x0 + 10, y0 + 10, R.int(5, 9));
  },
  stilts(L, p) {
    const R = L.R;
    L.clearArea(p.x, p.y, p.x + p.w, p.y + p.h);
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) L.ground(x, y, (H(x, y, 3) < 0.55) ? TL.SHALLOW : TL.MUD);
    for (let k = 0; k < 4; k++) {
      const x0 = p.x + 1 + (k % 2) * 12, y0 = p.y + 1 + (k >> 1) * 10;
      const r = house(L, x0, y0, 7, 6, { mat: 3, floor: TL.WOOD, door: 'bottom', ruin: 0.35, rooms: false });
      furnish(L, r, ['cabinet', R.chance(.5) ? 'crate' : 'fridge', { t: 'hbed' }]);
      for (let x = r.dx; x <= r.dx; x++) for (let y = r.dy + 1; y < r.dy + 3; y++) L.ground(x, y, TL.WOOD);
      if (k === 1) surv(L, r.x0 + 1, r.y0 + 1);
      if (k === 3) furnish(L, r, [{ t: 'cabinet', quest: R() < .4 ? 'radiopart' : null }]);
    }
    zom(L, p.x + 12, p.y + 9, R.int(5, 8), 'swamp');
    if (R() < 0.5) L.spawn(p.x + 12, p.y + 9, 'vehicle', { vk: 'boat', a: R() * 6.28, st: 'broken', water: 1 });
  },
  helicrash(L, p) {
    const R = L.R, cx = p.x + 6, cy = p.y + 6;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (Math.hypot(x - cx, y - cy) < 5.5) L.ground(x, y, TL.ASH);
    L.clearArea(p.x, p.y, p.x + p.w, p.y + p.h);
    L.put(cx, cy, { t: 'helicrash', fixed: R() < 0.4 ? { radiopart: 1, ammo762: 20, medkit: 1 } : null });
    for (let k = 0; k < 3; k++) L.put(cx + R.int(-4, 4), cy + R.int(-4, 4), { t: 'mcrate', v: 1 });
    for (let k = 0; k < 2; k++) L.put(cx + R.int(-3, 3), cy + R.int(3, 5), { t: 'corpse' });
    zom(L, cx, cy + 6, R.int(6, 9), 'military');
  },
  // rare: a small airfield with a hangar, a control hut and an An-2 on the strip
  airfield(L, p) {
    const R = L.R, x0 = p.x, y0 = p.y, x1 = x0 + p.w - 1, y1 = y0 + p.h - 1, ry = y0 + 15;
    L.clearArea(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
    for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + 5; y++) L.ground(x, y, y === ry + 2 && x % 4 < 2 ? TL.ROADLINE : TL.ROAD);
    L.fill(x0 + 1, y0 + 1, x0 + 16, y0 + 12, TL.CONCRETE);
    const hg = house(L, x0 + 2, y0 + 2, 14, 9, { door: 'bottom', mat: 2, floor: TL.CONCRETE, ruin: 0.06, rooms: false, roof: 3 });
    furnish(L, hg, ['toolbox', 'toolbox', { t: 'tires' }, 'crate', { t: 'crate', fixed: { pipe: 8, fuel: 2, parts: 4 } }]);
    const tw = house(L, x0 + 20, y0 + 4, 6, 6, { door: 'bottom', mat: 1, floor: TL.TILES, ruin: 0.1, rooms: false });
    furnish(L, tw, ['desk', 'locker', { t: 'desk', quest: R() < 0.3 ? 'radiopart' : null }]);
    for (let k = 0; k < 4; k++) L.put(x0 + 28 + k, y0 + 10, { t: 'barrel', c: k % 2 });
    L.put(x0 + 30, y0 + 6, { t: 'pole' }); L.put(x1 - 2, ry - 2, { t: 'lamppost' }); L.put(x0 + 2, ry - 2, { t: 'lamppost' });
    veh(L, x0 + 14, ry + 2, 'plane', 0, 'broken');
    if (R() < 0.25) veh(L, x0 + 9, y0 + 7, 'heli', R() * 6.28, 'broken');
    zom(L, x0 + 24, ry + 2, R.int(5, 9), 'military');
  },
  lake(L, p) {
    const R = L.R, cx = p.x + 8, cy = p.y + 7;
    L.clearArea(p.x, p.y, p.x + p.w, p.y + p.h);
    const r = house(L, cx - 3, cy - 3, 7, 6, { mat: 3, floor: TL.WOOD, door: 'bottom', ruin: 0.15, rooms: false });
    furnish(L, r, ['cabinet', 'fridge', { t: 'hbed' }, { t: 'locker', loot: 'cabin' }]);
    L.put(cx + 5, cy + 4, { t: 'campfire', hp: 9999, wild: 1, cold: 1 });
    if (R() < 0.5) surv(L, r.x0 + 1, r.y0 + 1);
    L.spawn(cx + 6, cy - 4, 'animals', { ak: 'deer', n: 3 });
    if (R() < 0.55) L.spawn(cx, cy, 'vehicle', { vk: R() < 0.35 ? 'motorboat' : 'boat', a: R() * 6.28, st: 'broken', water: 1 });
  },
  oasis(L, p) {
    const R = L.R, cx = p.x + 9, cy = p.y + 8;
    L.clearArea(p.x, p.y, p.x + p.w, p.y + p.h);
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      const d = Math.hypot((x - cx) * 1.1, y - cy) + (H(x, y, 3) - 0.5) * 1.2;
      if (d < 2.6) L.ground(x, y, TL.WATER); else if (d < 3.8) L.ground(x, y, TL.SHALLOW); else if (d < 6.5) L.ground(x, y, H(x, y, 5) < 0.5 ? TL.GRASS : TL.GRASS2); else if (d < 7.5) L.ground(x, y, TL.SAND);
    }
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28 + R() * 0.5, r = 4.6 + R() * 1.6; const x = Math.round(cx + Math.cos(a) * r * 1.1), y = Math.round(cy + Math.sin(a) * r); L.put(x, y, { t: 'palm', v: k % 2 }); }
    L.put(cx + 6, cy + 4, { t: 'tent', v: 1 }); L.put(cx + 7, cy + 2, { t: 'crate' }); L.put(cx - 7, cy + 3, { t: 'barrel', c: 0 });
    if (R() < 0.6) veh(L, cx - 6, cy - 5, 'buggy', R() * 6.28);
    if (R() < 0.4) surv(L, cx + 5, cy + 6);
    zom(L, cx + 9, cy - 6, R.int(2, 5), 'desert');
  },
  lab(L, p) {
    const R = L.R, x0 = p.x, y0 = p.y, snow = p.biome === SNOWB;
    L.fill(x0, y0, x0 + p.w - 1, y0 + p.h - 1, snow ? TL.SNOW2 : TL.CONCRETE);
    const r = house(L, x0 + 1, y0 + 1, p.w - 2, p.h - 4, { mat: 2, floor: TL.TILES, door: 'bottom', ruin: 0.08 });
    furnish(L, r, ['desk', 'desk', 'desk', 'medcab', 'locker', { t: 'desk', quest: 'radiopart' }, 'medcab']);
    L.put(x0 + p.w - 2, y0 + p.h - 2, { t: 'floodlight', wild: 1, hp: 9999 });
    zom(L, x0 + (p.w >> 1), y0 + p.h - 1, R.int(6, 9), 'lab');
  },
  roadjunk(L, p, W) {
    const R = L.R;
    if (p.dir === 'h') {
      for (let x = p.x + R.int(4, 20); x < p.x + p.w; x += R.int(14, 34)) {
        const r = R();
        if (r < 0.32) veh(L, x, p.ry + R.pick([-2, -1, 1, 2]), R.pick(['sedan', 'hatch', 'pickup', 'sedan', 'police', 'uaz']), R.chance(.5) ? 0 : Math.PI, R() < 0.4 ? 'wreck' : 'broken');
        else if (r < 0.4) { const y = p.ry + R.pick([-2, 1]); let ok = true; for (let k = 0; k < 4; k++) if (L.has(x + k, y)) ok = false; if (ok) { const parts = []; for (let k = 0; k < 3; k++) { L.put(x + k, y, { t: 'part', ref: [x + 3, y] }); parts.push([x + k, y]); } L.put(x + 3, y, { t: 'bus', dir: 0, len: 4, parts, loot: 'car', search: 2.5 }); } }
        else if (r < 0.5) L.put(x, p.ry + R.pick([-3, 3]), { t: 'barrier', v: 0 });
        else if (r < 0.56) zom(L, x, p.ry, R.int(2, 4));
        if (R() < 0.18) L.put(x + 2, p.ry - 4, { t: 'pole' });
        if (R() < 0.05) L.put(x + 1, p.ry + 4, { t: 'corpse' });
      }
    } else {
      for (let y = p.y + R.int(4, 20); y < p.y + p.h; y += R.int(14, 34)) {
        const r = R();
        if (r < 0.32) veh(L, p.rx + R.pick([-2, -1, 1, 2]), y, R.pick(['sedan', 'hatch', 'pickup', 'uaz']), R.chance(.5) ? Math.PI / 2 : -Math.PI / 2, R() < 0.4 ? 'wreck' : 'broken');
        else if (r < 0.4) L.put(p.rx + R.pick([-3, 3]), y, { t: 'barrier', v: 1 });
        else if (r < 0.47) zom(L, p.rx, y, R.int(2, 4));
        if (R() < 0.18) L.put(p.rx - 4, y + 2, { t: 'pole' });
      }
    }
  },
};
TZ.POI_GEN = GEN;
})();
