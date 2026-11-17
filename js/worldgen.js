'use strict';
// ============================================================================
//  Random world generator: relief, water, forests, meadows and a fauna drawn
//  from what the habitat can hold. Every world has a seed, so it can be
//  replayed identically (the life that follows is never the same twice).
//  opts: { seed, water: 0..1 | null, forest: 0..1 | null, predators: 0..1 | null }
// ============================================================================
(function () {
  const T = G.T, U = G.U, TC = G.TC;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // smooth value noise, several octaves
  function makeNoise(rnd) {
    const N = 256, perm = new Uint8Array(N * 2), val = new Float32Array(N);
    for (let i = 0; i < N; i++) { perm[i] = i; val[i] = rnd(); }
    for (let i = N - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < N; i++) perm[N + i] = perm[i];
    const v = (x, y) => val[perm[(x & 255) + perm[y & 255]]];
    const sm = (t) => t * t * (3 - 2 * t);
    function n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
      const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
    return function fbm(x, y, oct = 4) {
      let s = 0, amp = 0.5, f = 1, tot = 0;
      for (let o = 0; o < oct; o++) { s += n2(x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2; }
      return s / tot;
    };
  }

  G.generate = function (opts = {}) {
    const S = G.S;
    const seed = opts.seed != null ? opts.seed >>> 0 : (Math.random() * 1e9) >>> 0;
    const rnd = mulberry32(seed);
    const pick = (v, lo, hi) => (v == null ? lo + rnd() * (hi - lo) : v);
    // climate of this world
    const wet = pick(opts.water, 0, 1), forestF = pick(opts.forest, 0.05, 0.75), predF = pick(opts.predators, 0, 1);
    const hilly = rnd(), flowery = rnd();
    const TW = S.TW, TH = S.TH, NCELL = TW * TH;
    const elev = makeNoise(rnd), moist = makeNoise(rnd), wood = makeNoise(rnd), patch = makeNoise(rnd);
    const sc = 1 / 34; // feature size (terrain cells)
    const E = new Float32Array(NCELL), M = new Float32Array(NCELL);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const c = y * TW + x;
      E[c] = elev(x * sc, y * sc, 5) + (hilly - 0.5) * 0.15 * elev(x * sc * 0.5 + 40, y * sc * 0.5, 2);
      M[c] = moist(x * sc * 0.8, y * sc * 0.8, 3) * 0.7 + wet * 0.3;
    }
    // sea level chosen so that lakes cover a share of the map that follows the "water" setting
    const sorted = Float32Array.from(E).sort();
    const lakeShare = wet < 0.15 ? 0 : (wet - 0.15) * 0.16;          // 0 … ~13 %
    const wl = lakeShare > 0 ? sorted[Math.floor(lakeShare * NCELL)] : -1;
    const deepL = lakeShare > 0.04 ? sorted[Math.floor(lakeShare * 0.35 * NCELL)] : -1;
    const rockL = sorted[Math.floor((1 - (0.004 + hilly * 0.05)) * NCELL)];
    const terr = S.terr, veg = S.veg, tAge = S.tAge, tvar = S.tvar;
    for (let c = 0; c < NCELL; c++) {
      let tt = T.GRASS;
      const e = E[c], m = M[c];
      if (e <= deepL) tt = T.DEEP;
      else if (e <= wl) tt = T.WATER;
      else if (e >= rockL) tt = T.ROCK;
      terr[c] = tt;
    }
    // rivers: meandering, flowing from one edge to another
    const nRiv = wet < 0.2 ? (rnd() < wet * 2 ? 1 : 0) : wet < 0.6 ? 1 : 1 + (rnd() < (wet - 0.5) ? 1 : 0);
    for (let r = 0; r < nRiv; r++) {
      const vertical = rnd() < 0.5;
      let px = vertical ? TW * (0.2 + rnd() * 0.6) : 0, py = vertical ? 0 : TH * (0.2 + rnd() * 0.6);
      let ang = vertical ? Math.PI / 2 : 0;
      const base = ang, width = 0.8 + wet * 1.6 + rnd() * 0.6;
      for (let k = 0; k < (TW + TH) * 3; k++) {
        ang += (rnd() - 0.5) * 0.5; ang = base + Math.max(-0.9, Math.min(0.9, ang - base));
        px += Math.cos(ang) * 0.7; py += Math.sin(ang) * 0.7;
        if (px < -2 || py < -2 || px > TW + 2 || py > TH + 2) break;
        const w = width * (0.8 + 0.4 * patch(px * 0.05, py * 0.05));
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          if (dx * dx + dy * dy > w * w) continue;
          const x = Math.round(px + dx), y = Math.round(py + dy);
          if (x < 0 || y < 0 || x >= TW || y >= TH) continue;
          const c = y * TW + x;
          if (terr[c] !== T.DEEP) terr[c] = T.WATER;
        }
      }
    }
    // a few ponds, even in dry worlds (or none at all in the driest)
    const nPond = Math.round(rnd() * (1 + wet * 5) - (wet < 0.1 ? 1 : 0));
    for (let p = 0; p < nPond; p++) {
      const cx = 4 + rnd() * (TW - 8), cy = 4 + rnd() * (TH - 8), rr = 1.5 + rnd() * (1.5 + wet * 3);
      for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) {
        if (x < 0 || y < 0 || x >= TW || y >= TH) continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 * 1.3 <= rr * rr * (0.7 + 0.6 * patch(x * 0.3, y * 0.3))) terr[y * TW + x] = T.WATER;
      }
    }
    // shores: reeds in wet places, sand on dry banks, some mud
    const isW = (c) => terr[c] === T.WATER || terr[c] === T.DEEP;
    const nearW = new Uint8Array(NCELL);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const c = y * TW + x;
      if (isW(c)) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < TW && yy < TH && isW(yy * TW + xx)) nearW[c] = 1; }
    }
    for (let c = 0; c < NCELL; c++) {
      if (!nearW[c] || terr[c] === T.ROCK) continue;
      const x = c % TW, y = (c / TW) | 0, p = patch(x * 0.12, y * 0.12);
      if (M[c] > 0.55 && p > 0.45) terr[c] = T.REEDS;
      else if (M[c] < 0.4 && p > 0.6) terr[c] = T.SAND;
      else if (p < 0.22) terr[c] = T.MUD;
    }
    // vegetation: forests where it is wet enough, conifers up high, thickets at the edges, meadows, dry patches
    const fThr = 1 - forestF * 0.95;
    let nf = 0;
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const c = y * TW + x;
      if (terr[c] !== T.GRASS) continue;
      const f = wood(x * sc * 1.3, y * sc * 1.3, 4) * 0.75 + M[c] * 0.35 - 0.05, p = patch(x * 0.09 + 7, y * 0.09);
      if (f > fThr * 0.75 + 0.18) {
        terr[c] = T.FOREST; nf++;
        tAge[c] = 1 + rnd() * 12;
        tvar[c] = (tvar[c] & 0x9f) | (E[c] > 0.62 || (M[c] < 0.38 && rnd() < 0.5) ? 0x60 : 0);
      } else if (f > fThr * 0.75 + 0.12) { terr[c] = T.BUSH; tAge[c] = 1 + rnd() * 5; }
      else if (M[c] < 0.3 && p > 0.62) terr[c] = T.DIRT;
      else if (p > 0.66 - flowery * 0.15) terr[c] = T.FLOWERS;
      else if (p < 0.28) terr[c] = T.TALL;
    }
    // stray trees & bushes in the open
    for (let k = 0; k < NCELL * 0.004; k++) { const c = (rnd() * NCELL) | 0; if (terr[c] === T.GRASS) { terr[c] = rnd() < 0.5 ? T.FOREST : T.BUSH; tAge[c] = rnd() * 6; } }
    for (let c = 0; c < NCELL; c++) {
      const tt = terr[c];
      veg[c] = tt === T.DIRT ? 0.15 : Math.max(0.3, Math.min(1, 0.45 + M[c] * 0.8));
      if (tt !== T.FOREST && tt !== T.BUSH) tAge[c] = 0;
      tvar[c] &= tt === T.FOREST ? 0xf8 : 0xf8;
    }
    S.terrDirty = true; S.objDirty = true; S.fieldsDirty = true;

    // ---------------------------------------------------------------- fauna, according to habitat
    let cntW = 0, cntF = 0, cntG = 0, cntFl = 0;
    for (let c = 0; c < NCELL; c++) {
      const tt = terr[c];
      if (tt === T.WATER || tt === T.DEEP || tt === T.REEDS) cntW++;
      else if (tt === T.FOREST) cntF++;
      else if (tt === T.GRASS || tt === T.TALL || tt === T.FLOWERS) { cntG++; if (tt === T.FLOWERS) cntFl++; }
    }
    const fW = cntW / NCELL, fF = cntF / NCELL, fG = cntG / NCELL, area = (S.W * S.H) / (1100 * 600);
    const cellXY = (c) => [(c % TW) * TC + 4, ((c / TW) | 0) * TC + 4];
    const findCell = (ok) => { for (let k = 0; k < 3000; k++) { const c = (rnd() * NCELL) | 0; if (ok(terr[c], c)) return c; } return -1; };
    const census = [];
    function group(k, n, ok, spread) {
      const t = U[k];
      if (n < 1) return;
      let placed = 0;
      for (let g = 0; placed < n && g < 40; g++) {
        const c0 = findCell(ok);
        if (c0 < 0) break;
        const [cx, cy] = cellXY(c0);
        const gs = spread ? n : Math.max(1, Math.min(n - placed, 2 + ((rnd() * 8) | 0)));
        for (let a = 0, m = 0; a < gs * 30 && m < gs && placed < n; a++) {
          const r = spread ? rnd() * 400 : rnd() * 40, an = rnd() * 6.283;
          const x = spread ? 10 + rnd() * (S.W - 20) : cx + Math.cos(an) * r, y = spread ? 10 + rnd() * (S.H - 20) : cy + Math.sin(an) * r;
          const tt = terr[S.tcell(x, y)];
          if (!S.okAt(t, x, y) && !(G.UFL[t] & G.F.AIR)) continue;
          if (!spread && !ok(tt, S.tcell(x, y)) && !(G.UFL[t] & G.F.AIR)) continue;
          if (S.spawn(t, x, y) >= 0) { m++; placed++; }
        }
      }
      if (placed) census.push([k, placed]);
    }
    const chance = (p) => rnd() < p;
    const R = (a, b) => Math.round((a + rnd() * (b - a)) * area);
    const open = (tt) => tt === T.GRASS || tt === T.TALL || tt === T.FLOWERS;
    const woods = (tt) => tt === T.FOREST || tt === T.BUSH;
    const land = (tt) => !(tt === T.WATER || tt === T.DEEP || tt === T.ROCK || tt === T.REEDS);
    const shore = (tt, c) => tt === T.REEDS || (land(tt) && nearW[c]);
    const water = (tt) => tt === T.WATER || tt === T.DEEP;
    // herbivores
    if (chance(0.9)) group('rabbit', Math.round(R(20, 70) * (0.4 + fG)), open);
    if (chance(0.9)) group('mouse', Math.round(R(15, 50) * (0.4 + fG)), (tt) => open(tt) || tt === T.BUSH);
    if (fF > 0.04 && chance(0.85)) group('squirrel', Math.round(R(6, 24) * (0.3 + fF * 2)), (tt) => tt === T.FOREST);
    if (chance(0.85)) group('deer', Math.round(R(6, 30) * (0.5 + fG + fF)), (tt) => open(tt) || woods(tt));
    if (chance(0.6)) group('boar', R(3, 10), (tt) => woods(tt) || tt === T.MUD);
    if (fG > 0.35 && chance(0.35)) group('bison', R(4, 12), open);
    if (fW > 0.015 && fF > 0.03 && chance(0.6)) group('beaver', R(2, 4), shore);
    // predators: sized to the prey actually present (roughly 1 wolf per 15–25 large herbivores, 1 fox per 25 small mammals…)
    const cnt = (k) => { const e = census.find((c) => c[0] === k); return e ? e[1] : 0; };
    const small = cnt('rabbit') + cnt('mouse') + cnt('squirrel'), big = cnt('deer') + cnt('boar') + cnt('bison');
    const pp = 0.4 + predF * 1.2; // "predators" setting: rare … many
    const some = (n) => Math.floor(n * pp + rnd());
    if (chance(0.8)) group('fox', some(small / 28), land);
    if (big >= 12 && chance(0.6)) group('wolf', Math.max(2, some(big / 18)), land);
    if (fF > 0.08 && chance(0.5)) group('lynx', some((small + big) / 45), woods);
    if (chance(0.35)) group('bear', some(1 + rnd()), (tt) => woods(tt) || land(tt));
    // birds
    if (chance(0.6)) group('eagle', some((small + cnt('fish')) / 60), land, true);
    if (woods && chance(0.75)) group('owl', some(cnt('mouse') / 25 + 0.5), woods, true);
    if (big >= 8 && chance(0.4)) group('vulture', some(1 + rnd()), land, true);
    if (chance(0.7)) group('crow', R(4, 10), land);
    if (fW > 0.015 && chance(0.85)) group('duck', R(4, 12), (tt) => water(tt) || tt === T.REEDS);
    // water & insects
    if (fW > 0.008) group('fish', Math.max(4, Math.min(90, Math.round(cntW * 0.025 * (0.5 + rnd())))), water);
    if (fW > 0.008 && chance(0.8)) group('frog', R(5, 15), shore);
    if (fW > 0.015 && chance(0.6)) group('heron', some((cnt('fish') + cnt('frog')) / 25), shore);
    if (cntFl > 20 && chance(0.85)) group('butterfly', R(6, 14), (tt) => tt === T.FLOWERS);
    if (cntFl > 20 && chance(0.7)) { const n = 1 + ((rnd() * 2) | 0); for (let k = 0; k < n; k++) { const c = findCell((tt) => tt === T.FLOWERS || tt === T.GRASS); if (c >= 0) S.spawn(U.hive, ...cellXY(c)); } }
    S.buildGrid();
    const pct = (v) => Math.round(v * 100);
    const waterW = fW < 0.01 ? 'presque pas d\'eau' : fW < 0.04 ? 'peu d\'eau' : fW < 0.1 ? 'de l\'eau' : 'beaucoup d\'eau';
    const forestW = fF < 0.08 ? 'très peu de forêt' : fF < 0.25 ? 'quelques bois' : fF < 0.45 ? 'de grandes forêts' : 'une forêt dense';
    const info = { seed, water: fW, forest: fF, grass: fG, census, desc: `${waterW} (${pct(fW)} %), ${forestW} (${pct(fF)} %), ${pct(fG)} % de prairies` };
    S.world = info;
    S.chronicle('globe', `Monde n° ${seed} : ${info.desc}. Habitants : ${census.map(([k, n]) => `${n} ${n > 1 ? S.plural(U[k]) : G.UNITS[U[k]].name.toLowerCase()}`).join(', ') || 'aucun'}.`);
    return info;
  };
})();
