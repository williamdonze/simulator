'use strict';
// ============================================================================
//  Ecosystem simulation — data-oriented, fixed 30 Hz step.
//  Plants live on an 8-unit grid (vegetation 0..1 per cell), animals in
//  typed arrays indexed by a 16-unit spatial grid with per-cell species masks.
// ============================================================================
(function () {
  const F = G.F, HB = G.HB, D = G.D, T = G.T;
  const { MAXU, GC, TC, DT, DAY } = G;
  const UR = G.UR, USPD = G.USPD, URUN = G.URUN, UVIS = G.UVIS, UHP = G.UHP, UFL = G.UFL, UDIET = G.UDIET,
    UHAB = G.UHAB, UALT = G.UALT, UMASS = G.UMASS, PREY = G.PREY, PRED = G.PRED, FOOD = G.FOOD;
  const SP = G.UNITS, NTT = G.TERRAIN.length;
  const TSPD = new Float32Array(NTT), TBLK = new Uint8Array(NTT), TWATER = new Uint8Array(NTT), TGROW = new Float32Array(NTT),
    TFUEL = new Float32Array(NTT), TSPREAD = new Float32Array(NTT);
  G.TERRAIN.forEach((t, i) => { TSPD[i] = t.spd; TBLK[i] = t.block || 0; TWATER[i] = t.water || 0; TGROW[i] = t.grow; TFUEL[i] = t.fuel || 0; TSPREAD[i] = t.spread || 0; });
  G.TBLK = TBLK;
  const S = (G.S = {});
  const rnd = Math.random;
  const U = G.U;

  // ---------------------------------------------------------------- per-animal arrays
  const x = new Float32Array(MAXU), y = new Float32Array(MAXU), px = new Float32Array(MAXU), py = new Float32Array(MAXU);
  const z = new Float32Array(MAXU), dX = new Float32Array(MAXU), dY = new Float32Array(MAXU);
  const hp = new Float32Array(MAXU), en = new Float32Array(MAXU), wat = new Float32Array(MAXU), age = new Float32Array(MAXU), maxAge = new Float32Array(MAXU);
  const stam = new Float32Array(MAXU), preg = new Float32Array(MAXU), mateCd = new Float32Array(MAXU), cd = new Float32Array(MAXU);
  const hold = new Float32Array(MAXU), chaseT = new Float32Array(MAXU), atk = new Float32Array(MAXU), flash = new Float32Array(MAXU), anim = new Float32Array(MAXU);
  const goalX = new Float32Array(MAXU), goalY = new Float32Array(MAXU), size = new Float32Array(MAXU), store = new Float32Array(MAXU);
  const type = new Uint8Array(MAXU), alive = new Uint8Array(MAXU), sex = new Uint8Array(MAXU), state = new Uint8Array(MAXU), vari = new Uint8Array(MAXU);
  const team = new Uint8Array(MAXU), burn = new Float32Array(MAXU), ord = new Uint8Array(MAXU), loaded = new Uint8Array(MAXU);
  const face = new Int8Array(MAXU);
  const tgt = new Int32Array(MAXU).fill(-1), home = new Int32Array(MAXU).fill(-1), nameI = new Int32Array(MAXU), kills = new Int32Array(MAXU), kids = new Int32Array(MAXU);
  const cellOf = new Int32Array(MAXU), cellItems = new Int32Array(MAXU), freeStack = new Int32Array(MAXU);
  const birthT = new Float32Array(MAXU);
  let hw = 0, freeTop = 0;
  const pendingFree = [];
  Object.assign(S, { x, y, px, py, z, hp, en, wat, age, type, alive, sex, state, face, atk, flash, anim, size, vari, team, tgt, home, kills, kids, nameI, burn, store, preg, birthT, maxAge });
  // the renderer expects a projectile pool: keep an empty one
  S.proj = { alive: new Uint8Array(0) };
  S.nproj = 0;

  // states
  const ST = (S.ST = { WANDER: 0, GRAZE: 1, SEEK: 2, DRINK: 3, FLEE: 4, HUNT: 5, EAT: 6, MATE: 7, SLEEP: 8, FOLLOW: 9, FIGHT: 10, WORK: 11, HOME: 12, STALK: 13 });
  S.STATE_NAMES = ['se promène', 'mange', 'cherche à manger', 'va boire', 'fuit !', 'chasse', 'dévore une carcasse', 'cherche un partenaire', 'dort', 'suit sa mère', 'se bat', 'travaille', 'rentre à la ruche', 'est à l\'affût'];

  // ---------------------------------------------------------------- world
  let W, H, TW, TH, GW, GH, NC;
  let terr, veg, tvar, fireT, bareT, cellStart, cellMask, wdist, wdx, wdy, fdist, fdx, fdy;
  let fireList, fireN = 0;

  G.initWorld = function (w, h) {
    W = S.W = G.W = w; H = S.H = G.H = h;
    TW = S.TW = Math.ceil(w / TC); TH = S.TH = Math.ceil(h / TC);
    GW = S.GW = Math.ceil(w / GC); GH = S.GH = Math.ceil(h / GC); NC = GW * GH;
    terr = S.terr = new Uint8Array(TW * TH);
    veg = S.veg = new Float32Array(TW * TH);
    tvar = S.tvar = new Uint8Array(TW * TH);
    fireT = S.fireT = new Float32Array(TW * TH);
    bareT = new Float32Array(TW * TH);
    fireList = new Int32Array(TW * TH);
    for (let i = 0; i < tvar.length; i++) tvar[i] = (rnd() * 256) & 0xf8;
    cellStart = new Int32Array(NC + 1);
    cellMask = S.cellMask = new Uint32Array(NC);
    wdist = new Uint16Array(NC); wdx = new Float32Array(NC); wdy = new Float32Array(NC);
    fdist = new Uint16Array(NC); fdx = new Float32Array(NC); fdy = new Float32Array(NC);
    S.clearAll();
  };

  S.clearAll = function () {
    alive.fill(0); hw = 0; freeTop = 0; pendingFree.length = 0; S.hw = 0;
    terr.fill(T.GRASS); veg.fill(0.85); fireT.fill(0); bareT.fill(0); fireN = 0;
    for (let i = 0; i < tvar.length; i++) tvar[i] &= 0xf8;
    S.count = 0; S.tick = 0; S.time = DAY * 0.3; S.phase = 'battle';
    S.terrDirty = true; S.objDirty = true; S.fieldsDirty = true;
    S.events = []; S.counts = new Int32Array(G.NSP);
    S.hist = []; S.histT = 0;
    S.weather = 'clear'; S.weatherT = 0; S.rain = 0; S.snow = 0; S.rainbow = 0; S.lightning = 0;
    S.wind = 0; S.flags = {}; S.maxAnimals = 0; S.lastDay = -1; S.disco = 0;
    S.buildGrid();
  };

  // ---------------------------------------------------------------- helpers
  const tc = (wx, wy) => ((wy / TC) | 0) * TW + ((wx / TC) | 0);
  S.tcell = tc;
  function inWorld(wx, wy) { return wx >= 1 && wy >= 1 && wx < W - 1 && wy < H - 1; }
  // can species t stand on terrain tt ?
  function canEnter(t, tt) {
    switch (UHAB[t]) {
      case HB.AIR: return true;
      case HB.WATER: return TWATER[tt] === 1;
      case HB.DEEP: return tt === T.DEEP;
      case HB.SHORE: return tt !== T.ROCK && tt !== T.DEEP;
      case HB.AMPHI: return tt !== T.ROCK;
      default:
        if (TBLK[tt]) return false;
        if ((UFL[t] & F.SMALL) && TWATER[tt]) return false;
        return true;
    }
  }
  S.canEnter = canEnter;
  function okAt(t, wx, wy) { return inWorld(wx, wy) && canEnter(t, terr[tc(wx, wy)]); }
  S.okAt = okAt;
  function nearWater(wx, wy) {
    const cx = (wx / TC) | 0, cy = (wy / TC) | 0;
    for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
      if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
      if (TWATER[terr[yy * TW + xx]]) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- time
  S.day = () => S.time / DAY;
  S.hour = () => ((S.time / DAY) % 1) * 24;
  S.season = () => Math.floor(S.time / DAY / G.SEASON_DAYS) % 4; // 0 spring 1 summer 2 autumn 3 winter
  S.isNight = () => { const h = S.hour(); return h < 5.5 || h > 20.5; };
  function active(t) {
    const a = SP[t].active, h = S.hour();
    if (a === 'any') return true;
    if (a === 'day') return h > 6 && h < 20.5;
    if (a === 'night') return h < 7 || h > 18.5;
    return h < 10 || h > 16; // crepuscular (and night)
  }

  // ---------------------------------------------------------------- spawn / death
  S.spawn = function (t, wx, wy, opts) {
    if (S.count >= MAXU - 16) return -1;
    let i = freeTop > 0 ? freeStack[--freeTop] : hw++;
    S.hw = hw;
    const u = SP[t];
    x[i] = px[i] = wx; y[i] = py[i] = wy; z[i] = UALT[t];
    type[i] = t; alive[i] = 1; team[i] = 0; state[i] = ST.WANDER;
    sex[i] = rnd() < 0.5 ? 1 : 0;
    const baby = opts && opts.baby;
    age[i] = baby ? 0 : u.mature * (1 + rnd() * 1.5);
    if (u.mature >= 99) age[i] = 1;
    maxAge[i] = u.life * (0.75 + rnd() * 0.5);
    hp[i] = UHP[t]; en[i] = baby ? 0.85 : 0.65 + rnd() * 0.3; wat[i] = 0.7 + rnd() * 0.3;
    stam[i] = u.stamina || 5; preg[i] = 0; mateCd[i] = rnd() * 0.3; cd[i] = 0; hold[i] = 0; chaseT[i] = 0; atk[i] = 0; flash[i] = 0;
    anim[i] = rnd() * 10; burn[i] = 0; store[i] = 0; loaded[i] = 0; kills[i] = 0; kids[i] = 0;
    const a = rnd() * 6.283; dX[i] = Math.cos(a); dY[i] = Math.sin(a);
    face[i] = dX[i] >= 0 ? 1 : -1;
    tgt[i] = -1; home[i] = opts && opts.home != null ? opts.home : -1; ord[i] = opts && opts.ord || 0;
    vari[i] = opts && opts.vari || 0;
    nameI[i] = (rnd() * 1e6) | 0;
    birthT[i] = S.time;
    size[i] = sizeOf(t, age[i]);
    if (UFL[t] & F.HIVE) store[i] = 8;
    S.count++;
    return i;
  };
  function sizeOf(t, a) { const m = SP[t].mature; return m >= 99 ? 1 : Math.min(1, 0.45 + 0.55 * (a / m)); }
  function free(i) { pendingFree.push(i); }
  S.remove = function (i) { if (!alive[i]) return; alive[i] = 0; S.count--; free(i); };

  function die(i, cause) {
    if (!alive[i]) return;
    const t = type[i];
    alive[i] = 0; S.count--; free(i);
    if (UFL[t] & (F.STATIC | F.MAGIC)) { if (UFL[t] & F.MAGIC) G.fx.sparkle(x[i], y[i] - 6, 10); return; }
    const meat = SP[t].meat * size[i];
    G.fx.poof(x[i], y[i] - 3 - z[i] * 0.5);
    if (meat >= 0.2 && cause !== 'eaten') {
      const c = S.spawn(U.carcass, x[i], y[i] - 0);
      if (c >= 0) { store[c] = meat; hp[c] = meat; size[c] = Math.min(1.6, 0.5 + meat * 0.25); anim[c] = t; face[c] = face[i]; }
    } else if (cause !== 'eaten') fertilize(x[i], y[i], 0.2);
  }
  S.die = die;

  function fertilize(wx, wy, amt) {
    const cx = (wx / TC) | 0, cy = (wy / TC) | 0;
    for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
      if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
      const c = yy * TW + xx;
      if (terr[c] === T.DIRT || terr[c] === T.BURNT) { terr[c] = T.GRASS; S.terrDirty = true; S.objDirty = true; }
      veg[c] = Math.min(1, veg[c] + amt);
    }
  }

  // ---------------------------------------------------------------- grid
  S.buildGrid = function () {
    for (let k = 0; k < pendingFree.length; k++) freeStack[freeTop++] = pendingFree[k];
    pendingFree.length = 0;
    while (hw > 0 && !alive[hw - 1]) hw--;
    let w = 0;
    for (let k = 0; k < freeTop; k++) { const v = freeStack[k]; if (v < hw && !alive[v]) freeStack[w++] = v; }
    freeTop = w;
    S.hw = hw;
    cellStart.fill(0); cellMask.fill(0);
    const counts = S.counts; counts.fill(0);
    for (let i = 0; i < hw; i++) {
      if (!alive[i]) continue;
      let cx = (x[i] / GC) | 0, cy = (y[i] / GC) | 0;
      if (cx < 0) cx = 0; else if (cx >= GW) cx = GW - 1;
      if (cy < 0) cy = 0; else if (cy >= GH) cy = GH - 1;
      const c = cy * GW + cx;
      cellOf[i] = c; cellStart[c + 1]++;
      cellMask[c] |= 1 << type[i];
      counts[type[i]]++;
    }
    for (let c = 0; c < NC; c++) cellStart[c + 1] += cellStart[c];
    const cur = cursor || (cursor = new Int32Array(NC));
    if (cur.length < NC) cursor = new Int32Array(NC);
    for (let c = 0; c < NC; c++) cursor[c] = cellStart[c];
    for (let i = 0; i < hw; i++) if (alive[i]) cellItems[cursor[cellOf[i]]++] = i;
  };
  let cursor = null;

  // nearest individual matching `mask`, with a per-mode filter
  // mode: 0 any, 1 prey, 2 mate, 3 carcass with meat, 4 same species (herd), 5 hive with honey
  let packN = 0;
  function nearest(i, rad, mask, mode) {
    const xi = x[i], yi = y[i], ti = type[i];
    const R = Math.ceil(rad / GC);
    let cx = (xi / GC) | 0, cy = (yi / GC) | 0;
    let best = -1, bs = 1e18;
    const r2 = rad * rad;
    for (let yy = Math.max(0, cy - R); yy <= Math.min(GH - 1, cy + R); yy++) {
      for (let xx = Math.max(0, cx - R); xx <= Math.min(GW - 1, cx + R); xx++) {
        const c = yy * GW + xx;
        if ((cellMask[c] & mask) === 0) continue;
        for (let k = cellStart[c], e = cellStart[c + 1]; k < e; k++) {
          const j = cellItems[k];
          if (j === i || !alive[j] || ((1 << type[j]) & mask) === 0) continue;
          const dx = x[j] - xi, dy = y[j] - yi, d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          let s = d2;
          if (mode === 1) {
            // weak prey first: young, old, injured. Prey hidden in tall grass is harder to spot
            const tt = terr[tc(x[j], y[j])];
            if (tt === T.TALL && d2 > 400) continue;
            if (UFL[type[j]] & F.ARBOREAL && tt === T.FOREST && !(UFL[ti] & F.AIR) && d2 > 200) continue;
            if (UHAB[type[j]] === HB.WATER && !(UFL[ti] & F.AIR) && UHAB[ti] !== HB.SHORE && !TWATER[terr[tc(xi, yi)]] && d2 > 900) s *= 2;
            s *= (0.4 + 0.6 * hp[j] / UHP[type[j]]) * (0.5 + size[j] * 0.5);
            if (UHP[type[j]] * size[j] > UHP[ti] * 1.6) {
              // big prey: only packs, and preferably the young or the wounded
              if (!(UFL[ti] & F.PACK) || (packN < 3 && size[j] > 0.8 && hp[j] > UHP[type[j]] * 0.6)) continue;
              s *= 2.5;
            }
          } else if (mode === 2) {
            if (type[j] !== ti || sex[j] === sex[i] || age[j] < SP[ti].mature || mateCd[j] > 0 || preg[j] > 0 || state[j] === ST.FLEE) continue;
          } else if (mode === 3) {
            if (store[j] <= 0.05) continue;
          } else if (mode === 5) {
            if (store[j] < 3) continue;
          }
          if (s < bs) { bs = s; best = j; }
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- flow fields (water, forest)
  function rebuildFields() {
    const q = new Int32Array(NC);
    for (const [dist, ox, oy, test] of [[wdist, wdx, wdy, (tt) => TWATER[tt]], [fdist, fdx, fdy, (tt) => tt === T.FOREST]]) {
      dist.fill(65535);
      let qh = 0, qt = 0;
      for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
        let hit = false;
        for (let sy = 0; sy < 2 && !hit; sy++) for (let sx = 0; sx < 2; sx++) {
          const tx = cx * 2 + sx, ty = cy * 2 + sy;
          if (tx < TW && ty < TH && test(terr[ty * TW + tx])) { hit = true; break; }
        }
        if (hit) { const c = cy * GW + cx; dist[c] = 0; q[qt++] = c; }
      }
      while (qh < qt) {
        const c = q[qh++], cx = c % GW, cy = (c / GW) | 0, d = dist[c] + 1;
        for (let k = 0; k < 8; k++) {
          const nx = cx + NX[k], ny = cy + NY[k];
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          const n = ny * GW + nx;
          if (dist[n] !== 65535) continue;
          dist[n] = d; q[qt++] = n;
        }
      }
      for (let c = 0; c < NC; c++) {
        const dc = dist[c];
        ox[c] = 0; oy[c] = 0;
        if (dc === 0 || dc === 65535) continue;
        const cx = c % GW, cy = (c / GW) | 0;
        let best = dc, bk = -1;
        for (let k = 0; k < 8; k++) {
          const nx = cx + NX[k], ny = cy + NY[k];
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          const v = dist[ny * GW + nx] + (k >= 4 ? 0.41 : 0);
          if (v < best) { best = v; bk = k; }
        }
        if (bk >= 0) { const l = bk >= 4 ? 0.7071 : 1; ox[c] = NX[bk] * l; oy[c] = NY[bk] * l; }
      }
    }
    S.fieldsDirty = false;
  }
  const NX = [1, -1, 0, 0, 1, 1, -1, -1], NY = [0, 0, 1, -1, 1, -1, 1, -1];

  // ---------------------------------------------------------------- vegetation & terrain dynamics
  function updatePlants(dt) {
    const season = S.season();
    const sf = [1.35, 1.0, 0.55, 0.04][season];
    const berry = [0.25, 1.1, 1.3, 0][season];
    const nuts = [0.3, 0.6, 1.6, 0.05][season];
    const rainF = 1 + S.rain * 1.2;
    const k = (dt / DAY) * rainF;
    let changed = false;
    for (let c = 0, n = terr.length; c < n; c++) {
      const tt = terr[c];
      let g = TGROW[tt] * sf;
      if (tt === T.BUSH) g = TGROW[tt] * berry;
      else if (tt === T.FOREST) g = TGROW[tt] * nuts;
      let v = veg[c];
      v += g * k * (1.05 - v);
      if (v > 1) v = 1;
      veg[c] = v;
      // overgrazing → bare earth, and recolonisation
      if (tt === T.GRASS || tt === T.TALL || tt === T.FLOWERS) {
        if (v < 0.04 && season !== 3) { bareT[c] += dt / DAY; if (bareT[c] > 1.6) { terr[c] = T.DIRT; veg[c] = 0; bareT[c] = 0; changed = true; } }
        else bareT[c] = 0;
      } else if (tt === T.DIRT || tt === T.BURNT) {
        if (v > (tt === T.BURNT ? 0.55 : 0.4) && rnd() < 0.3 * dt / DAY * 20) { terr[c] = T.GRASS; veg[c] = 0.35; changed = true; }
      } else if (tt === T.GRASS && v > 0.9 && rnd() < 0.002 * dt) {
        // slow natural succession next to the forest
      }
    }
    // natural succession: forest edges creep onto ungrazed meadow (rare)
    const tries = Math.max(1, (terr.length / 2000) | 0);
    for (let s = 0; s < tries; s++) {
      if (rnd() > 0.25 * dt) continue;
      const c = (rnd() * terr.length) | 0;
      const tt = terr[c];
      if ((tt === T.GRASS || tt === T.TALL) && veg[c] > 0.92) {
        const n = neighbourOf(c);
        if (n >= 0 && (terr[n] === T.FOREST || terr[n] === T.BUSH)) { terr[c] = rnd() < 0.5 ? T.BUSH : T.FOREST; tvar[c] |= 1; changed = true; }
      }
    }
    if (changed) { S.objDirty = true; S.fieldsDirty = true; }
  }
  function neighbourOf(c) {
    const cx = c % TW, cy = (c / TW) | 0, k = (rnd() * 4) | 0;
    const nx = cx + NX[k], ny = cy + NY[k];
    if (nx < 0 || ny < 0 || nx >= TW || ny >= TH) return -1;
    return ny * TW + nx;
  }
  S.setTerrain = function (c, tt) { terr[c] = tt; S.terrDirty = true; S.objDirty = true; S.fieldsDirty = true; };

  // ---------------------------------------------------------------- fire
  function ignite(c) {
    const tt = terr[c];
    if (TFUEL[tt] <= 0 || fireT[c] > 0 || veg[c] < 0.1) return;
    fireT[c] = TFUEL[tt] * (0.7 + rnd() * 0.6) * (0.5 + veg[c] * 0.5);
    fireList[fireN++] = c;
  }
  S.ignite = ignite;
  function updateFire(dt) {
    let n = fireN;
    const dry = S.season() === 1 ? 1.6 : 1;
    for (let k = 0; k < n; k++) {
      const c = fireList[k];
      fireT[c] -= dt * (1 + S.rain * 4);
      if (fireT[c] <= 0) {
        fireT[c] = 0;
        if (TFUEL[terr[c]] > 0) { if (terr[c] === T.FOREST) tvar[c] |= 2; else tvar[c] &= ~2; terr[c] = T.BURNT; veg[c] = 0; }
        S.objDirty = true; S.fieldsDirty = true;
        fireList[k] = fireList[--n]; k--;
        continue;
      }
      const cx = c % TW, cy = (c / TW) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + NX[d], ny = cy + NY[d];
        if (nx < 0 || ny < 0 || nx >= TW || ny >= TH) continue;
        const nc = ny * TW + nx, nt = terr[nc];
        if (TFUEL[nt] > 0 && fireT[nc] <= 0 && veg[nc] > 0.1 && rnd() < TSPREAD[nt] * dt * dry * (1 - S.rain) * (1 + S.wind)) { fireList[n++] = nc; fireT[nc] = TFUEL[nt] * (0.7 + rnd() * 0.6); }
      }
      if (rnd() < 0.3) G.fx.fireCell(cx * TC + 4, cy * TC + 4, terr[c]);
    }
    fireN = n; S.fireN = n;
    if (n) S.terrDirty = true;
  }

  // ---------------------------------------------------------------- weather, seasons, events
  function toast(msg, key) {
    if (key) { if (S.flags[key]) return; S.flags[key] = 1; }
    S.events.push(msg);
  }
  S.toast = toast;
  function updateWorld(dt) {
    const day = S.time / DAY, dayN = Math.floor(day), season = S.season(), hour = S.hour();
    // new day at dawn: decide weather & special events
    if (dayN !== S.lastDay && hour > 5) {
      S.lastDay = dayN;
      const p = [0.35, 0.22, 0.4, 0.4][season];
      if (rnd() < p) {
        S.weather = season === 3 ? 'snow' : season === 1 && rnd() < 0.55 ? 'storm' : 'rain';
        S.weatherT = (0.15 + rnd() * 0.35) * DAY;
        S.weatherStart = 4 + rnd() * 12; // hours after dawn
      } else S.weather = 'clear';
      if (dayN % G.SEASON_DAYS === 0) {
        const nm = ['🌸 Le printemps arrive : l\'herbe repousse, les naissances reprennent.', '☀️ L\'été : les baies mûrissent, attention aux incendies.', '🍂 L\'automne : les noix tombent, c\'est la saison du brame.', '❄️ L\'hiver : la nourriture se fait rare. Les ours hibernent.'][season];
        if (dayN > 0) toast(nm);
        S.objDirty = true; S.terrDirty = true;
      }
      // spring: chrysalises hatch on flowery meadows (if butterflies lived here last year)
      if (S.counts[U.butterfly] > 0) S.flags.bfly = 1;
      if (season === 0 && dayN >= 4 * G.SEASON_DAYS && S.flags.bfly && S.counts[U.butterfly] < 30) {
        for (let k = 0, n = 0; k < 400 && n < 6; k++) {
          const c = (rnd() * terr.length) | 0;
          if (terr[c] === T.FLOWERS) { S.spawn(U.butterfly, (c % TW) * TC + 4, ((c / TW) | 0) * TC + 4, { baby: true }); n++; }
        }
        if (dayN % G.SEASON_DAYS === 0) toast('🦋 Les chrysalides éclosent : les papillons sont de retour.');
      }
      // unicorn: an ecosystem balanced for a long time
      const sp = speciesAlive();
      if (dayN >= 6 && sp >= 9 && !S.counts[U.unicorn] && !S.flags['uni' + Math.floor(dayN / 10)] && rnd() < 0.5 && (S.flags['uni' + Math.floor(dayN / 10)] = 1)) spawnSecret('unicorn', '🦄 Ton écosystème est si équilibré qu\'une licorne est apparue !');
    }
    // weather state machine
    const want = S.weather !== 'clear' && hour > (S.weatherStart || 0) + 5 && S.weatherT > 0;
    if (want) S.weatherT -= dt;
    const target = want ? 1 : 0;
    const before = S.rain;
    S.rain += (target - S.rain) * Math.min(1, dt * 0.5);
    if (before > 0.5 && S.rain <= 0.5 && S.weather !== 'snow' && hour > 7 && hour < 19) { S.rainbow = 1; toast('🌈 Un arc-en-ciel après la pluie !', 'rainbow' + Math.floor(day / 3)); }
    if (S.rainbow > 0) S.rainbow -= dt / (DAY * 0.12);
    // lightning during storms
    if (S.weather === 'storm' && S.rain > 0.6 && rnd() < dt * 0.25) {
      S.lightning = 1;
      const c = (rnd() * terr.length) | 0;
      if ((terr[c] === T.FOREST || terr[c] === T.TALL) && rnd() < 0.5) { ignite(c); toast('⚡ La foudre a mis le feu à la végétation !', 'bolt' + Math.floor(day)); }
    }
    if (S.lightning > 0) S.lightning -= dt * 3;
    // snow cover
    const snowT = season === 3 ? (S.weather === 'snow' && S.rain > 0.3 ? 1 : S.snow > 0.3 ? 0.8 : 0) : 0;
    S.snow += (Math.max(snowT, S.snow * (season === 3 ? 1 : 0)) - S.snow) * Math.min(1, dt * (season === 3 ? 0.08 : 0.15));
    if (season !== 3) S.snow = Math.max(0, S.snow - dt * 0.05);
    // full moon: every 8th night
    if (dayN % 8 === 4 && (hour > 22 || hour < 2) && S.counts[U.wolf] > 0) {
      if (!S.flags['moon' + dayN]) {
        toast('🌕 Pleine lune : les loups hurlent… Aouuuuh !', 'moon' + dayN);
        for (let i = 0; i < hw; i++) if (alive[i] && type[i] === U.wolf) { atk[i] = 1.5; G.fx.note(x[i], y[i] - 10); }
      }
    }
    // bigfoot at night in big forests
    if (S.isNight() && rnd() < dt * 0.002 && !S.counts[U.bigfoot] && forestCells > 400) spawnSecret('bigfoot', '👣 Quelque chose de grand traverse la forêt…');
    // population records
    S.histT += dt;
    if (S.histT > DAY * 0.1) {
      S.histT = 0;
      S.hist.push({ t: day, c: Array.from(S.counts) });
      if (S.hist.length > 600) S.hist = S.hist.filter((_, k) => k % 2 === 0);
    }
    // milestones / easter eggs
    let animals = 0;
    for (let t = 0; t < G.NSP; t++) if (!(UFL[t] & (F.STATIC)) && t !== U.bee && t !== U.butterfly) animals += S.counts[t];
    S.maxAnimals = Math.max(S.maxAnimals, animals);
    if (S.maxAnimals >= 12 && animals === 0) toast('🤫 Printemps silencieux : plus un seul animal…', 'silent');
    if (S.counts[U.rabbit] > 900) toast('🐇 Explosion de lapins ! Un vrai scénario australien… Il manque des prédateurs.', 'rabbits');
    if (S.counts[U.deer] > 250 && !S.counts[U.wolf]) toast('🦌 Sans loups, les cerfs pullulent et dévorent la forêt.', 'deer');
    if (S.disco > 0) S.disco -= dt;
  }
  let forestCells = 0;
  function speciesAlive() {
    let n = 0;
    for (let t = 0; t < G.NSP; t++) if (S.counts[t] > 0 && !(UFL[t] & (F.STATIC | F.HIDDEN))) n++;
    return n;
  }
  function spawnSecret(k, msg) {
    const t = U[k];
    for (let tries = 0; tries < 200; tries++) {
      const wx = 20 + rnd() * (W - 40), wy = 20 + rnd() * (H - 40);
      const tt = terr[tc(wx, wy)];
      if (!canEnter(t, tt)) continue;
      if (k === 'bigfoot' && tt !== T.FOREST) continue;
      if (k === 'unicorn' && tt !== T.FLOWERS && tt !== T.GRASS) continue;
      const i = S.spawn(t, wx, wy);
      if (i >= 0) { G.fx.sparkle(wx, wy - 6, 14); toast(msg); }
      return i;
    }
    return -1;
  }
  S.spawnSecret = spawnSecret;

  // ---------------------------------------------------------------- decision (staggered)
  let mvx = 0, mvy = 0, mvs = 0;
  function steerTo(i, tx, ty, s) {
    const dx = tx - x[i], dy = ty - y[i], l = Math.sqrt(dx * dx + dy * dy) || 1;
    dX[i] = dx / l; dY[i] = dy / l; return l;
  }

  function decide(i, t) {
    const u = SP[t], fl = UFL[t], diet = UDIET[t];
    const xi = x[i], yi = y[i];
    const ci = tc(xi, yi);
    // ------------------------------------------------ juveniles follow their mother
    const adult = age[i] >= u.mature;
    // ------------------------------------------------ 1. danger
    if (!(fl & F.NAIVE) && PRED[t] && state[i] !== ST.FIGHT) {
      const rv = UVIS[t] * (S.isNight() && !(u.active === 'night') ? 0.6 : 1);
      const p = nearest(i, rv, PRED[t], 0);
      if (p >= 0) {
        const pd = Math.hypot(x[p] - xi, y[p] - yi);
        const hunting = state[p] === ST.HUNT || state[p] === ST.STALK;
        if (pd < rv * 0.45 || (hunting && tgt[p] === i) || (hunting && pd < rv * 0.8)) {
          // stand and fight?
          if (fl & F.FIGHT && adult && hunting && tgt[p] >= 0 && type[tgt[p]] === t && Math.hypot(x[tgt[p]] - xi, y[tgt[p]] - yi) < 60) {
            const mates = countNear(i, 45, 1 << t);
            if (mates >= 2 || UHP[t] * size[i] > UHP[type[p]] * 0.8) { state[i] = ST.FIGHT; tgt[i] = p; return; }
          }
          // squirrels climb trees
          if (fl & F.ARBOREAL && terr[ci] === T.FOREST && !(UFL[type[p]] & F.AIR)) { state[i] = ST.SLEEP; hold[i] = 1; return; }
          state[i] = ST.FLEE; tgt[i] = p;
          let ax = xi - x[p], ay = yi - y[p];
          if (fl & F.ARBOREAL && fdist[cellOf[i]] < 6) { ax += fdx[cellOf[i]] * pd; ay += fdy[cellOf[i]] * pd; }
          if (UHAB[t] === HB.AMPHI || t === U.duck) { const c = cellOf[i]; if (wdist[c] < 5) { ax += wdx[c] * pd; ay += wdy[c] * pd; } }
          const l = Math.hypot(ax, ay) || 1; dX[i] = ax / l; dY[i] = ay / l;
          return;
        }
      }
    }
    // fire nearby
    if (fireN && !(fl & F.AIR)) {
      for (let k = 0; k < 6; k++) {
        const a = k * 1.047, sx = xi + Math.cos(a) * 24, sy = yi + Math.sin(a) * 24;
        if (inWorld(sx, sy) && fireT[tc(sx, sy)] > 0) { state[i] = ST.FLEE; tgt[i] = -1; dX[i] = -Math.cos(a); dY[i] = -Math.sin(a); return; }
      }
    }
    // ------------------------------------------------ special species
    if (t === U.bee) return decideBee(i);
    if (fl & F.MAGIC) return decideMagic(i, t);
    // ------------------------------------------------ 2. sleep / hibernate
    const season = S.season();
    if (fl & F.HIBERNATE && season === 3 && en[i] > 0.15) { state[i] = ST.SLEEP; return; }
    if (!active(t) && en[i] > 0.3 && (wat[i] > 0.3 || u.thirst > 50)) { state[i] = ST.SLEEP; return; }
    // ------------------------------------------------ 3. follow mother
    if (!adult && age[i] < u.mature * 0.6 && home[i] >= 0 && alive[home[i]] && type[home[i]] === t) { state[i] = ST.FOLLOW; tgt[i] = home[i]; return; }
    // ------------------------------------------------ 4. thirst
    if (u.thirst < 50 && wat[i] < 0.35 && !(fl & F.AIR && wat[i] > 0.15)) {
      state[i] = ST.DRINK; return;
    }
    // ------------------------------------------------ 5. hunger
    const hungry = en[i] < 0.6 || (state[i] === ST.GRAZE && en[i] < 0.97) || (state[i] === ST.EAT && en[i] < 0.98);
    if (hungry) {
      // carcass?
      if (diet & D.CARRION || (diet & D.MEAT && en[i] < 0.5)) {
        const c = nearest(i, diet & D.CARRION ? UVIS[t] : UVIS[t] * 0.5, 1 << U.carcass, 3);
        if (c >= 0) { state[i] = ST.EAT; tgt[i] = c; return; }
      }
      // honey
      if (diet & D.HONEY && en[i] < 0.7) {
        const h = nearest(i, UVIS[t] * 1.5, 1 << U.hive, 5);
        if (h >= 0) { state[i] = ST.EAT; tgt[i] = h; return; }
      }
      // hunt
      if ((diet & (D.MEAT | D.FISH | D.INSECT)) && PREY[t] && cd[i] <= 0) {
        // join a hunting pack mate
        if (fl & F.PACK) {
          const m = nearest(i, 110, 1 << t, 0);
          if (m >= 0 && state[m] === ST.HUNT && tgt[m] >= 0 && alive[tgt[m]]) { state[i] = ST.HUNT; tgt[i] = tgt[m]; chaseT[i] = chaseT[m]; return; }
        }
        packN = fl & F.PACK ? countNear(i, 90, 1 << t) + 1 : 1;
        const p = nearest(i, UVIS[t], PREY[t], 1);
        if (p >= 0) { state[i] = fl & F.STALK ? ST.STALK : ST.HUNT; tgt[i] = p; chaseT[i] = 0; return; }
      }
      if (diet & D.INSECT && TWATER[terr[ci]] + (nearWater(xi, yi) ? 1 : 0)) en[i] = Math.min(1, en[i] + 0.0012); // gnats & mosquitoes
      // plants
      if (G.FOOD[t * NTT + terr[ci]] > 0 && veg[ci] > 0.18) { state[i] = ST.GRAZE; return; }
      if (diet & ~(D.MEAT | D.CARRION | D.FISH | D.INSECT | D.HONEY)) {
        let best = -1, bv = 0.15, bx = 0, by = 0;
        const rad = Math.min(UVIS[t], 120);
        for (let k = 0; k < 10; k++) {
          const a = k < 3 ? Math.atan2(dY[i], dX[i]) + (rnd() - 0.5) : rnd() * 6.283;
          const d = (0.25 + rnd() * 0.75) * rad;
          const sx = xi + Math.cos(a) * d, sy = yi + Math.sin(a) * d;
          if (!inWorld(sx, sy)) continue;
          const c = tc(sx, sy), tt = terr[c];
          if (!canEnter(t, tt) && !(t === U.bear && TWATER[tt])) continue;
          const v = G.FOOD[t * NTT + tt] * veg[c] - d / rad * 0.15;
          if (v > bv) { bv = v; best = c; bx = sx; by = sy; }
        }
        if (best >= 0) { state[i] = ST.SEEK; goalX[i] = bx; goalY[i] = by; return; }
      }
    }
    // ------------------------------------------------ 6. reproduction
    if (adult && u.gest < 50 && en[i] > 0.55 && (wat[i] > 0.4 || u.thirst > 50) && mateCd[i] <= 0 && preg[i] <= 0 && season !== 3) {
      // deer rut in autumn: males clash
      if (t === U.deer && season === 2 && sex[i] === 1 && rnd() < 0.15) {
        const r = nearest(i, 40, 1 << t, 0);
        if (r >= 0 && sex[r] === 1 && age[r] >= u.mature) { state[i] = ST.FIGHT; tgt[i] = r; toast('🦌 Le brame du cerf résonne : deux mâles s\'affrontent !', 'rut' + Math.floor(S.time / DAY / 16)); return; }
      }
      const crowd = countNear(i, 50, 1 << t);
      if (crowd < (fl & F.SMALL ? 14 : 9)) {
        const m = nearest(i, UVIS[t], 1 << t, 2);
        if (m >= 0) { state[i] = ST.MATE; tgt[i] = m; return; }
      }
    }
    // ------------------------------------------------ 7. social & wander
    if (fl & (F.HERD | F.PACK)) {
      const m = herdCenter(i, fl & F.PACK ? 120 : 70);
      if (m) { state[i] = ST.WANDER; return; }
    }
    if (state[i] !== ST.WANDER) { state[i] = ST.WANDER; tgt[i] = -1; }
  }

  function countNear(i, rad, mask) {
    const R = Math.ceil(rad / GC), cx = (x[i] / GC) | 0, cy = (y[i] / GC) | 0, r2 = rad * rad;
    let n = 0;
    for (let yy = Math.max(0, cy - R); yy <= Math.min(GH - 1, cy + R); yy++)
      for (let xx = Math.max(0, cx - R); xx <= Math.min(GW - 1, cx + R); xx++) {
        const c = yy * GW + xx;
        if (!(cellMask[c] & mask)) continue;
        for (let k = cellStart[c], e = cellStart[c + 1]; k < e; k++) {
          const j = cellItems[k];
          if (j !== i && alive[j] && (1 << type[j]) & mask && (x[j] - x[i]) ** 2 + (y[j] - y[i]) ** 2 < r2) n++;
        }
      }
    return n;
  }
  // steer gently toward the herd / pack
  function herdCenter(i, rad) {
    const R = Math.ceil(rad / GC), cx = (x[i] / GC) | 0, cy = (y[i] / GC) | 0, t = type[i], m = 1 << t;
    let sx = 0, sy = 0, n = 0, hx = 0, hy = 0;
    for (let yy = Math.max(0, cy - R); yy <= Math.min(GH - 1, cy + R); yy++)
      for (let xx = Math.max(0, cx - R); xx <= Math.min(GW - 1, cx + R); xx++) {
        const c = yy * GW + xx;
        if (!(cellMask[c] & m)) continue;
        for (let k = cellStart[c], e = cellStart[c + 1]; k < e; k++) {
          const j = cellItems[k];
          if (j === i || !alive[j] || type[j] !== t) continue;
          sx += x[j]; sy += y[j]; hx += dX[j]; hy += dY[j]; n++;
        }
      }
    if (!n) return false;
    sx /= n; sy /= n;
    const dx = sx - x[i], dy = sy - y[i], d = Math.hypot(dx, dy);
    // cohesion + alignment
    let ax = dX[i] + hx / n * 0.6, ay = dY[i] + hy / n * 0.6;
    if (d > 18) { ax += dx / d * 1.2; ay += dy / d * 1.2; }
    const l = Math.hypot(ax, ay) || 1; dX[i] = ax / l; dY[i] = ay / l;
    return true;
  }

  // bees: hive ↔ flowers
  function decideBee(i) {
    const h = home[i];
    if (h < 0 || !alive[h]) { state[i] = ST.WANDER; return; }
    if (S.isNight() || S.rain > 0.5 || S.season() === 3) { state[i] = ST.HOME; return; }
    if (loaded[i]) { state[i] = ST.HOME; return; }
    if (state[i] === ST.SEEK && hold[i] > 0) return;
    let best = -1, bv = 0.2, bx = 0, by = 0;
    for (let k = 0; k < 12; k++) {
      const a = rnd() * 6.283, d = 10 + rnd() * 140;
      const sx = x[h] + Math.cos(a) * d, sy = y[h] + Math.sin(a) * d;
      if (!inWorld(sx, sy)) continue;
      const c = tc(sx, sy);
      if (terr[c] === T.FLOWERS && veg[c] > bv) { bv = veg[c]; best = c; bx = sx; by = sy; }
    }
    if (best >= 0) { state[i] = ST.SEEK; goalX[i] = bx; goalY[i] = by; hold[i] = 0; }
    else state[i] = ST.WANDER;
  }
  function decideMagic(i, t) {
    if (t === U.unicorn) { if (rnd() < 0.3) G.fx.sparkle(x[i], y[i] - 8, 2); state[i] = ST.WANDER; }
    else state[i] = ST.WANDER;
  }

  // ---------------------------------------------------------------- per tick
  function bite(i, j) {
    const t = type[i];
    const dmg = UR[t] * UR[t] * 0.9 * size[i] * (S.season() === 3 ? 0.9 : 1);
    hp[j] -= dmg; flash[j] = 0.12; atk[i] = 0.3; cd[i] = 0.5;
    face[i] = x[j] > x[i] ? 1 : -1;
    if (hp[j] <= 0) {
      kills[i]++;
      const small = SP[type[j]].meat < 0.6 || (UFL[t] & F.AIR);
      if (small) { en[i] = Math.min(1, en[i] + SP[type[j]].meat * 1.5 / Math.max(0.3, UR[t] * UR[t] / 20)); die(j, 'eaten'); state[i] = ST.WANDER; tgt[i] = -1; if (type[j] === U.dodo) toast('🦤 Et voilà… le dodo a encore disparu.', 'dodo'); }
      else { die(j); state[i] = ST.WANDER; tgt[i] = -1; cd[i] = 0; }
      G.fx.poof(x[j], y[j] - 3);
    }
  }

  S.step = function () {
    S.tick++; S.time += DT;
    const tick = S.tick;
    S.buildGrid();
    if (S.fieldsDirty && tick % 15 === 0) { rebuildFields(); forestCells = 0; for (let c = 0; c < terr.length; c++) if (terr[c] === T.FOREST) forestCells++; }
    if (tick % 10 === 0) updatePlants(DT * 10);
    if (tick % 3 === 0) updateFire(DT * 3);
    if (tick % 5 === 0) updateWorld(DT * 5);
    if (tick % 15 === 0) S.terrDirty = true;
    const night = S.isNight(), season = S.season();
    const rev = tick & 1;
    for (let ii = 0; ii < hw; ii++) {
      const i = rev ? hw - 1 - ii : ii;
      if (!alive[i]) continue;
      const t = type[i], u = SP[t], fl = UFL[t];
      px[i] = x[i]; py[i] = y[i];
      if (flash[i] > 0) flash[i] -= DT;
      if (atk[i] > 0) atk[i] -= DT;
      // -------------------------------------------- static things
      if (fl & F.STATIC) {
        if (fl & F.CARCASS) {
          store[i] -= DT / (DAY * 2.5);
          if (((tick + i) & 31) === 0) G.fx.fly(x[i], y[i] - 4);
          if (store[i] <= 0) { fertilize(x[i], y[i], 0.6); S.remove(i); }
          else size[i] = Math.min(1.6, 0.45 + store[i] * 0.25);
        } else if (fl & F.HIVE) {
          store[i] = Math.min(40, store[i]);
          if (((tick + i) % 90) === 0 && !night && season !== 3 && store[i] > 1 && countNear(i, 160, 1 << U.bee) < 24) {
            const b = S.spawn(U.bee, x[i], y[i] - 2, { home: i });
            if (b >= 0) store[i] -= 0.5;
          }
          if (((tick + i) % 600) === 0) store[i] += 0.3;
        }
        continue;
      }
      // -------------------------------------------- physiology
      age[i] += DT / DAY;
      size[i] = sizeOf(t, age[i]);
      const sleeping = state[i] === ST.SLEEP;
      const running = state[i] === ST.FLEE || state[i] === ST.HUNT;
      if (u.hunger < 50) en[i] -= DT / (u.hunger * DAY) * (sleeping ? (fl & F.HIBERNATE && season === 3 ? 0.08 : 0.45) : running ? 1.8 : 1) * (season === 3 ? 1.25 : 1);
      if (u.thirst < 50 && !(sleeping && fl & F.HIBERNATE && season === 3)) wat[i] -= DT / (u.thirst * DAY) * (season === 1 ? 1.3 : 1) * (sleeping ? 0.5 : 1);
      if (S.rain > 0.5 && !(fl & F.AIR)) wat[i] = Math.min(1, wat[i] + DT * 0.01);
      if (en[i] <= 0) { en[i] = 0; hp[i] -= UHP[t] * DT * 0.05; }
      if (wat[i] <= 0) { wat[i] = 0; hp[i] -= UHP[t] * DT * 0.06; }
      if (age[i] > maxAge[i] && !(fl & F.MAGIC && t !== U.bigfoot && t !== U.unicorn)) { die(i, 'age'); continue; }
      if (hp[i] <= 0) { die(i); continue; }
      if (hp[i] < UHP[t] && en[i] > 0.4) hp[i] = Math.min(UHP[t], hp[i] + UHP[t] * DT * 0.01);
      if (mateCd[i] > 0) mateCd[i] -= DT / DAY;
      if (cd[i] > 0) cd[i] -= DT;
      // insects don't survive the winter (the hive keeps the colony alive)
      if (season === 3 && (t === U.butterfly || t === U.bee) && rnd() < DT * 0.05) { S.remove(i); continue; }
      // fire
      const ci = tc(x[i], y[i]);
      if (fireT[ci] > 0 && !(fl & F.AIR)) { hp[i] -= UHP[t] * DT * 0.35; if (((tick + i) & 7) === 0) G.fx.unitFire(x[i], y[i]); if (hp[i] <= 0) { die(i); continue; } }
      // gestation
      if (preg[i] > 0) {
        preg[i] -= DT / DAY;
        if (preg[i] <= 0) giveBirth(i, t);
      }
      // -------------------------------------------- decide
      if (((tick + i) % 6) === 0 || (tgt[i] >= 0 && !alive[tgt[i]])) {
        if (tgt[i] >= 0 && !alive[tgt[i]]) { tgt[i] = -1; if (state[i] !== ST.SLEEP) state[i] = ST.WANDER; }
        decide(i, t);
      }
      // -------------------------------------------- act
      act(i, t, u, fl, ci);
      if (!alive[i]) continue;
      // -------------------------------------------- move
      move(i, t, fl);
    }
    separate();
  };

  function giveBirth(i, t) {
    const u = SP[t];
    let n = u.litter[0] + ((rnd() * (u.litter[1] - u.litter[0] + 1)) | 0);
    if (en[i] < 0.4) n = Math.max(1, n >> 1);
    let golden = false;
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283;
      const bx = x[i] + Math.cos(a) * 4, by = y[i] + Math.sin(a) * 4;
      if (!okAt(t, bx, by) && !(UFL[t] & F.AIR)) continue;
      let v = 0;
      if (t === U.rabbit && rnd() < 1 / 220) { v = 1; golden = true; }
      else if (rnd() < 1 / 300) v = 2;
      else if (t === U.crow && rnd() < 0.12) v = 4;
      const b = S.spawn(t, bx, by, { baby: true, home: i, ord: k, vari: v });
      if (b >= 0) { kids[i]++; if (v === 2) toast(`🤍 Un ${u.name.toLowerCase()} albinos est né !`, 'albino' + t); }
    }
    if (golden) toast('✨ Un lapin doré est né ! Ouvre l\'œil (et la loupe).', 'golden' + Math.floor(S.time / DAY));
    en[i] -= 0.15;
  }

  function act(i, t, u, fl, ci) {
    mvs = 0;
    const s = state[i];
    const j = tgt[i];
    switch (s) {
      case ST.WANDER: {
        mvs = fl & F.AIR ? (t === U.vulture || t === U.eagle ? 0.7 : 0.6) : 0.35;
        // smooth random walk
        const turn = (fl & F.AIR) && (t === U.vulture || t === U.eagle) ? 0.035 : (rnd() - 0.5) * 0.35;
        const a = Math.atan2(dY[i], dX[i]) + turn;
        dX[i] = Math.cos(a); dY[i] = Math.sin(a);
        // habitat preference: aquatic-ish stay near water, squirrels/lynx near forest, fish school
        if ((UHAB[t] === HB.AMPHI || UHAB[t] === HB.SHORE) && wdist[cellOf[i]] > 1) { dX[i] = dX[i] * 0.3 + wdx[cellOf[i]]; dY[i] = dY[i] * 0.3 + wdy[cellOf[i]]; norm(i); }
        if ((fl & F.ARBOREAL || t === U.lynx || t === U.bigfoot) && fdist[cellOf[i]] > 1) { dX[i] = dX[i] * 0.4 + fdx[cellOf[i]]; dY[i] = dY[i] * 0.4 + fdy[cellOf[i]]; norm(i); }
        if (t === U.butterfly && terr[ci] === T.FLOWERS) mvs = 0.25;
        if (fl & F.AIR && z[i] < UALT[t]) z[i] = Math.min(UALT[t], z[i] + 0.8);
        if ((S.tick + i) % 120 < 30 && !(fl & F.AIR)) mvs = 0; // pauses
        break;
      }
      case ST.SLEEP: {
        if (fl & F.AIR) { if (z[i] > 0) z[i] = Math.max(0, z[i] - 0.6); }
        if (hold[i] > 0) hold[i] -= DT;
        if (((S.tick + i) % 150) === 0) G.fx.zzz(x[i], y[i] - UR[t] * 2 - z[i]);
        break;
      }
      case ST.GRAZE: {
        const fv = G.FOOD[t * NTT + terr[ci]];
        if (fv <= 0 || veg[ci] < 0.04) { state[i] = ST.WANDER; break; }
        const cons = UR[t] * UR[t] / 40;
        const gain = Math.min(veg[ci] / cons, DT / (DAY * 0.05)) * fv;
        en[i] = Math.min(1, en[i] + gain);
        veg[ci] = Math.max(0, veg[ci] - gain * cons * (t === U.boar ? 1.6 : 1));
        if (t === U.boar && veg[ci] < 0.05 && rnd() < 0.002) S.setTerrain(ci, T.DIRT);
        if (t === U.squirrel && terr[ci] === T.FOREST && rnd() < 0.0015) plantNut(i);
        if (((S.tick + i) & 15) < 8) atk[i] = 0.1;
        mvs = 0.05;
        if (en[i] > 0.98) state[i] = ST.WANDER;
        break;
      }
      case ST.SEEK: {
        if (t === U.bee) {
          const l = steerTo(i, goalX[i], goalY[i]);
          if (l < 4) {
            mvs = 0;
            hold[i] += DT;
            const c = tc(goalX[i], goalY[i]);
            if (hold[i] > 1.2) {
              loaded[i] = 1; veg[c] = Math.max(0, veg[c] - 0.05);
              if (rnd() < 0.08) pollinate(c);
              state[i] = ST.HOME; hold[i] = 0;
            }
          } else mvs = 1;
          break;
        }
        const l = steerTo(i, goalX[i], goalY[i]);
        mvs = 0.7;
        if (l < 5) state[i] = ST.GRAZE;
        break;
      }
      case ST.HOME: {
        const h = home[i];
        if (h < 0 || !alive[h]) { state[i] = ST.WANDER; break; }
        const l = steerTo(i, x[h], y[h]);
        mvs = 0.9;
        if (l < 4) {
          if (loaded[i]) { store[h] += 0.4; loaded[i] = 0; }
          if (S.isNight() || S.rain > 0.5 || S.season() === 3) { if (rnd() < 0.002) S.remove(i); mvs = 0; }
          state[i] = ST.WANDER;
        }
        break;
      }
      case ST.DRINK: {
        if (TWATER[terr[ci]] || nearWater(x[i], y[i])) {
          mvs = 0; wat[i] = Math.min(1, wat[i] + DT / (DAY * 0.04)); atk[i] = 0.1;
          if (wat[i] > 0.97) state[i] = ST.WANDER;
          // bears fish while standing in the river
          break;
        }
        const c = cellOf[i];
        if (wdist[c] === 65535) { state[i] = ST.WANDER; wat[i] = Math.max(wat[i], 0.4); break; }
        if (wdist[c] === 0) {
          // find the nearest water cell locally
          const cx = (x[i] / TC) | 0, cy = (y[i] / TC) | 0;
          let bd = 1e9, bx = 0, by = 0;
          for (let yy = cy - 3; yy <= cy + 3; yy++) for (let xx = cx - 3; xx <= cx + 3; xx++) {
            if (xx < 0 || yy < 0 || xx >= TW || yy >= TH || !TWATER[terr[yy * TW + xx]]) continue;
            const d = (xx - cx) ** 2 + (yy - cy) ** 2;
            if (d < bd) { bd = d; bx = xx * TC + 4; by = yy * TC + 4; }
          }
          if (bd < 1e9) steerTo(i, bx, by);
        } else { dX[i] = wdx[c]; dY[i] = wdy[c]; }
        mvs = 0.8;
        break;
      }
      case ST.FLEE: {
        mvs = stam[i] > 0 ? 1 : 0.5;
        stam[i] = Math.max(0, stam[i] - DT);
        if (fl & F.AIR) z[i] = Math.min(UALT[t] || 30, z[i] + 1.5);
        if (j >= 0 && alive[j]) {
          const dx = x[i] - x[j], dy = y[i] - y[j], d = Math.hypot(dx, dy) || 1;
          if (d > UVIS[t] * 1.1) state[i] = ST.WANDER;
          else { dX[i] = dX[i] * 0.7 + dx / d * 0.3; dY[i] = dY[i] * 0.7 + dy / d * 0.3; norm(i); }
        } else if (((S.tick + i) % 60) === 0) state[i] = ST.WANDER;
        break;
      }
      case ST.STALK: {
        if (j < 0 || !alive[j]) { state[i] = ST.WANDER; break; }
        const l = steerTo(i, x[j], y[j]);
        if (t === U.heron) { mvs = l > 40 ? 0.45 : 0.12; if (l < 16) { state[i] = ST.HUNT; chaseT[i] = 0; } break; }
        mvs = 0.3;
        if (l < 34) { state[i] = ST.HUNT; chaseT[i] = 0; }
        break;
      }
      case ST.HUNT: {
        if (j < 0 || !alive[j]) { state[i] = ST.WANDER; break; }
        chaseT[i] += DT;
        const l = steerTo(i, x[j], y[j]);
        mvs = stam[i] > 0 ? 1 : 0.55;
        stam[i] = Math.max(0, stam[i] - DT * 0.7);
        if (fl & F.AIR) {
          // dive onto prey
          z[i] = Math.max(1, Math.min(UALT[t], l * 0.6));
          if (UHAB[type[j]] === HB.WATER && l < 8) z[i] = 0;
        }
        if (t === U.bear && UHAB[type[j]] === HB.WATER && !TWATER[terr[ci]]) { mvs = 0.6; }
        if (t === U.frog) { mvs = 0.3; if (l < 14) { G.fx.tongue(x[i], y[i] - 2, x[j], y[j] - z[j]); en[i] = Math.min(1, en[i] + 0.25); die(j, 'eaten'); state[i] = ST.WANDER; break; } }
        const reach = UR[t] + UR[type[j]] + 1.5;
        if (l < reach && cd[i] <= 0) bite(i, j);
        if (chaseT[i] > (u.chase || 3)) { state[i] = ST.WANDER; cd[i] = 4 + rnd() * 4; tgt[i] = -1; }
        break;
      }
      case ST.EAT: {
        if (j < 0 || !alive[j]) { state[i] = ST.WANDER; break; }
        const l = steerTo(i, x[j], y[j]);
        mvs = 0.8;
        if (fl & F.AIR) z[i] = Math.max(0, Math.min(UALT[t], (l - 4) * 0.8));
        if (l < UR[t] + UR[type[j]] + 2) {
          mvs = 0; atk[i] = 0.15;
          const g = DT / (DAY * 0.06);
          if (UFL[type[j]] & F.HIVE) {
            if (store[j] > 0) { store[j] -= g * 10; en[i] = Math.min(1, en[i] + g); if (rnd() < 0.05) { hp[i] -= 2; flash[i] = 0.1; } toast('🐻🍯 Un ours pille une ruche… et se fait piquer !', 'honey'); }
            if (store[j] <= 0 || en[i] > 0.97) { state[i] = ST.WANDER; tgt[i] = -1; }
          } else {
            store[j] -= g * UR[t] * UR[t] / 25; en[i] = Math.min(1, en[i] + g);
            if (en[i] > 0.98) { state[i] = ST.WANDER; tgt[i] = -1; }
          }
        }
        break;
      }
      case ST.MATE: {
        if (j < 0 || !alive[j] || mateCd[j] > 0 || preg[j] > 0) { state[i] = ST.WANDER; break; }
        const l = steerTo(i, x[j], y[j]);
        mvs = 0.6;
        if (l < UR[t] * 2 + 3) {
          const f = sex[i] === 0 ? i : j;
          preg[f] = SP[t].gest; mateCd[i] = mateCd[j] = SP[t].gest * 1.2 + 0.3;
          G.fx.heart(x[i], y[i] - UR[t] * 2 - z[i]);
          state[i] = state[j] = ST.WANDER; tgt[i] = tgt[j] = -1;
        }
        break;
      }
      case ST.FOLLOW: {
        if (j < 0 || !alive[j]) { state[i] = ST.WANDER; break; }
        // ducklings walk in a line behind their mother
        const gap = (UR[t] * 2.2) * (ord[i] + 1);
        const gx = x[j] - dX[j] * gap, gy = y[j] - dY[j] * gap;
        const l = steerTo(i, gx, gy);
        mvs = l > 3 ? Math.min(1, l / 20 + 0.3) : 0;
        if (state[j] === ST.FLEE) mvs = 1;
        break;
      }
      case ST.FIGHT: {
        if (j < 0 || !alive[j]) { state[i] = ST.WANDER; break; }
        const l = steerTo(i, x[j], y[j]);
        if (type[j] !== t && (l > 70 || state[j] === ST.FLEE)) { state[i] = ST.WANDER; tgt[i] = -1; break; }
        mvs = 0.9;
        if (l < UR[t] + UR[type[j]] + 2 && cd[i] <= 0) {
          if (type[j] === t) { // rut: ritual clash, nobody dies
            atk[i] = 0.3; cd[i] = 0.8; G.fx.clash(x[i] + dX[i] * UR[t], y[i] - UR[t]);
            if (rnd() < 0.15) { state[i] = ST.WANDER; tgt[i] = -1; }
          } else {
            const dmg = UR[t] * UR[t] * 0.3 * size[i];
            hp[j] -= dmg; flash[j] = 0.12; atk[i] = 0.3; cd[i] = 0.9;
            if (hp[j] <= 0) { die(j); kills[i]++; state[i] = ST.WANDER; }
            else if ((state[j] === ST.HUNT || state[j] === ST.STALK) && rnd() < 0.5) { state[j] = ST.FLEE; tgt[j] = i; cd[j] = 8; stam[j] = Math.max(stam[j], 2); }
          }
        }
        if (((S.tick + i) % 90) === 0) state[i] = ST.WANDER;
        break;
      }
    }
    // beavers: fell trees next to water and build dams
    if (t === U.beaver && state[i] !== ST.FLEE && state[i] !== ST.SLEEP && ((S.tick + i) % 30) === 0) beaverWork(i);
    // the fox and the crow (La Fontaine)
    if (t === U.fox && ((S.tick + i) % 20) === 0) {
      const c = nearest(i, 26, 1 << U.crow, 0);
      if (c >= 0 && vari[c] === 4) {
        vari[c] = 0; en[i] = Math.min(1, en[i] + 0.3); G.fx.note(x[c], y[c] - z[c] - 6);
        toast('🦊🧀 « Mon bon Monsieur, apprenez que tout flatteur vit aux dépens de celui qui l\'écoute. »', 'fable');
      }
    }
  }
  function norm(i) { const l = Math.hypot(dX[i], dY[i]) || 1; dX[i] /= l; dY[i] /= l; }

  function plantNut(i) {
    for (let k = 0; k < 6; k++) {
      const a = rnd() * 6.283, d = 12 + rnd() * 30;
      const sx = x[i] + Math.cos(a) * d, sy = y[i] + Math.sin(a) * d;
      if (!inWorld(sx, sy)) continue;
      const c = tc(sx, sy);
      if (terr[c] === T.GRASS || terr[c] === T.DIRT) { terr[c] = T.FOREST; tvar[c] |= 1; veg[c] = 0.2; S.objDirty = true; S.fieldsDirty = true; S.terrDirty = true; toast('🌰 Un écureuil a oublié une noix : un jeune arbre pousse.', 'nut'); return; }
    }
  }
  function pollinate(c) {
    const n = neighbourOf(c);
    if (n >= 0 && (terr[n] === T.GRASS || terr[n] === T.TALL)) { terr[n] = T.FLOWERS; S.objDirty = true; S.terrDirty = true; }
  }
  function beaverWork(i) {
    if (en[i] > 0.9 && rnd() < 0.7) return;
    const cx = (x[i] / TC) | 0, cy = (y[i] / TC) | 0;
    for (let k = 0; k < 8; k++) {
      const xx = cx + ((rnd() * 7) | 0) - 3, yy = cy + ((rnd() * 7) | 0) - 3;
      if (xx < 1 || yy < 1 || xx >= TW - 1 || yy >= TH - 1) continue;
      const c = yy * TW + xx;
      if (terr[c] === T.FOREST && nearWater(xx * TC + 4, yy * TC + 4)) {
        terr[c] = T.GRASS; veg[c] = 0.3; tvar[c] |= 4; en[i] = Math.min(1, en[i] + 0.35); atk[i] = 0.5;
        G.fx.debris(xx * TC + 4, yy * TC + 4, 0xff3a6a9a, 4);
        // dam: flood a neighbouring land cell
        if (store[i] < 14 && rnd() < 0.6) {
          const n = neighbourOf(c);
          if (n >= 0 && (terr[n] === T.GRASS || terr[n] === T.DIRT || terr[n] === T.MUD || terr[n] === T.TALL)) { terr[n] = T.WATER; veg[n] = 0.3; store[i]++; toast('🦫 Un castor construit un barrage : un étang se forme !', 'dam'); }
        }
        S.objDirty = true; S.terrDirty = true; S.fieldsDirty = true;
        return;
      }
    }
  }

  // -------------------------------------------- movement
  function move(i, t, fl) {
    if (mvs <= 0) { anim[i] += 0; return; }
    const ci = tc(x[i], y[i]);
    let sp = (state[i] === ST.FLEE || state[i] === ST.HUNT ? URUN[t] : USPD[t]) * mvs;
    if (!(fl & F.AIR)) sp *= TSPD[terr[ci]] || 0.3;
    if (age[i] < SP[t].mature) sp *= 0.75 + 0.25 * size[i];
    if (S.snow > 0.5 && !(fl & F.AIR)) sp *= 0.8;
    if (stam[i] < (SP[t].stamina || 5) && state[i] !== ST.FLEE && state[i] !== ST.HUNT) stam[i] += DT * 0.3;
    const nx = x[i] + dX[i] * sp * DT, ny = y[i] + dY[i] * sp * DT;
    if (okAt(t, nx, ny)) { x[i] = nx; y[i] = ny; }
    else if (okAt(t, nx, y[i])) { x[i] = nx; dY[i] = -dY[i] * 0.5; norm(i); }
    else if (okAt(t, x[i], ny)) { y[i] = ny; dX[i] = -dX[i] * 0.5; norm(i); }
    else { const a = Math.atan2(dY[i], dX[i]) + Math.PI * (0.6 + rnd() * 0.8); dX[i] = Math.cos(a); dY[i] = Math.sin(a); if (state[i] === ST.SEEK) state[i] = ST.WANDER; }
    if (dX[i] > 0.15) face[i] = 1; else if (dX[i] < -0.15) face[i] = -1;
    anim[i] += sp * DT * 0.22;
  }

  // -------------------------------------------- separation (Jacobi, ground and air layers)
  const sxA = new Float32Array(MAXU), syA = new Float32Array(MAXU), srA = new Float32Array(MAXU), smA = new Float32Array(MAXU), axA = new Float32Array(MAXU), ayA = new Float32Array(MAXU);
  function separate() {
    const n = cellStart[NC];
    for (let k = 0; k < n; k++) {
      const i = cellItems[k], t = type[i];
      sxA[k] = x[i]; syA[k] = y[i]; axA[k] = 0; ayA[k] = 0;
      if (!alive[i] || UFL[t] & (F.STATIC | F.SMALL) && UR[t] < 1.5) { smA[k] = 0; srA[k] = 0; }
      else { smA[k] = UMASS[t]; srA[k] = UR[t] * (0.5 + 0.5 * size[i]) * 0.9; if (UFL[t] & F.AIR) smA[k] = -smA[k]; }
    }
    const MAXN = 20;
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      const c = cy * GW + cx, a0 = cellStart[c], a1 = Math.min(cellStart[c + 1], a0 + MAXN);
      if (a0 === a1) continue;
      for (let ka = a0; ka < a1; ka++) {
        let mi = smA[ka]; if (mi === 0) continue;
        const li = mi < 0; if (li) mi = -mi;
        const xi = sxA[ka], yi = syA[ka], ri = srA[ka];
        let axi = 0, ayi = 0;
        for (let p = 0; p < 5; p++) {
          let b0, b1;
          if (p === 0) { b0 = ka + 1; b1 = a1; }
          else {
            const nx = cx + (p === 1 ? 1 : p === 2 ? 0 : p === 3 ? -1 : 1), ny = cy + (p === 1 ? 0 : 1);
            if (nx < 0 || nx >= GW || ny >= GH) continue;
            const nc = ny * GW + nx; b0 = cellStart[nc]; b1 = Math.min(cellStart[nc + 1], b0 + MAXN);
          }
          for (let kb = b0; kb < b1; kb++) {
            let mj = smA[kb]; if (mj === 0 || (mj < 0) !== li) continue; if (mj < 0) mj = -mj;
            const dx = sxA[kb] - xi, dy = syA[kb] - yi, rr = ri + srA[kb], d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr || d2 < 1e-6) continue;
            const d = Math.sqrt(d2), push = (rr - d) * 0.4 / d, wi = mj / (mi + mj);
            axi -= dx * push * wi; ayi -= dy * push * wi;
            axA[kb] += dx * push * (1 - wi); ayA[kb] += dy * push * (1 - wi);
          }
        }
        axA[ka] += axi; ayA[ka] += ayi;
      }
    }
    for (let k = 0; k < n; k++) {
      if (smA[k] === 0) continue;
      const i = cellItems[k], nx = sxA[k] + axA[k], ny = syA[k] + ayA[k];
      if (okAt(type[i], nx, ny)) { x[i] = nx; y[i] = ny; }
    }
  }

  // ---------------------------------------------------------------- tools
  S.paintTerrain = function (wx, wy, rad, tt) {
    const x0 = Math.max(0, ((wx - rad) / TC) | 0), x1 = Math.min(TW - 1, ((wx + rad) / TC) | 0);
    const y0 = Math.max(0, ((wy - rad) / TC) | 0), y1 = Math.min(TH - 1, ((wy + rad) / TC) | 0);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const dx = tx * TC + 4 - wx, dy = ty * TC + 4 - wy;
      if (dx * dx + dy * dy > rad * rad) continue;
      const c = ty * TW + tx;
      if (terr[c] === tt) continue;
      terr[c] = tt; veg[c] = 0.9; fireT[c] = 0; tvar[c] &= ~7; bareT[c] = 0;
    }
    S.terrDirty = true; S.objDirty = true; S.fieldsDirty = true;
    // animals that can't live there anymore move out (or die if stuck)
    for (let i = 0; i < hw; i++) if (alive[i] && !(UFL[type[i]] & F.AIR) && Math.hypot(x[i] - wx, y[i] - wy) < rad + 4 && !canEnter(type[i], terr[tc(x[i], y[i])])) {
      let ok = false;
      for (let k = 0; k < 16 && !ok; k++) { const a = rnd() * 6.283, d = rad + 6 + rnd() * 20, nx = wx + Math.cos(a) * d, ny = wy + Math.sin(a) * d; if (okAt(type[i], nx, ny)) { x[i] = px[i] = nx; y[i] = py[i] = ny; ok = true; } }
      if (!ok) S.remove(i);
    }
  };
  S.igniteAt = function (wx, wy, rad) {
    const x0 = Math.max(0, ((wx - rad) / TC) | 0), x1 = Math.min(TW - 1, ((wx + rad) / TC) | 0);
    const y0 = Math.max(0, ((wy - rad) / TC) | 0), y1 = Math.min(TH - 1, ((wy + rad) / TC) | 0);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (rnd() < 0.4) ignite(ty * TW + tx);
  };
  S.eraseAt = function (wx, wy, rad) {
    for (let i = 0; i < hw; i++) if (alive[i] && Math.hypot(x[i] - wx, y[i] - wy) < rad + UR[type[i]]) S.remove(i);
  };
  S.pick = function (wx, wy) {
    let best = -1, bd = 14 * 14;
    for (let i = 0; i < hw; i++) {
      if (!alive[i]) continue;
      const dx = x[i] - wx, dy = y[i] - z[i] - UR[type[i]] - wy, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  S.makeRain = function () { S.weather = S.season() === 3 ? 'snow' : 'rain'; S.weatherT = DAY * 0.25; S.weatherStart = S.hour() - 5; };
  S.discoTime = function () { S.disco = 20; };
  S.isLoaded = (i) => loaded[i];
})();
