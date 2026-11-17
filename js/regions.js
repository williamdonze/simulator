'use strict';
// ============================================================================
//  Regions: the map is split into a 4×3 grid of named regions. Regional
//  statistics (vegetation, water, forest, ash, soil moisture, population per
//  species, mean genes, sick animals) are recomputed every few days — they
//  feed the climate, the migrations and the event director.
// ============================================================================
(function () {
  const RX = 4, RY = 3, NR = RX * RY, NGR = 5; // genes tracked per region: speed, size, sight, coat, immunity
  const ROW = ['nord', 'centre', 'sud'], COL = ['ouest', 'centre-ouest', 'centre-est', 'est'];
  const NAMES = [];
  for (let r = 0; r < RY; r++) for (let c = 0; c < RX; c++) {
    if (r === 1) NAMES.push(c === 0 ? 'l\'ouest' : c === 3 ? 'l\'est' : 'le centre');
    else NAMES.push(`le ${ROW[r]}${c === 0 ? '-ouest' : c === 3 ? '-est' : ''}`);
  }
  const R = (G.regions = {
    RX, RY, NR, NGR, NAMES,
    name: (r) => NAMES[r],
    de: (r) => NAMES[r].startsWith('le ') ? 'du ' + NAMES[r].slice(3) : 'de ' + NAMES[r],                 // « du nord », « de l'ouest »
    Name: (r) => NAMES[r][0].toUpperCase() + NAMES[r].slice(1),
    // build the cell → region lookup (after initWorld / load)
    rebuild() {
      const S = G.S, TW = S.TW, TH = S.TH;
      const reg = (S.regionOf = new Uint8Array(TW * TH));
      for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) reg[y * TW + x] = Math.min(RY - 1, ((y / TH) * RY) | 0) * RX + Math.min(RX - 1, ((x / TW) * RX) | 0);
      if (!S.regGrow || S.regGrow.length !== NR) S.regGrow = new Float32Array(NR).fill(1);
      R.update();
    },
    at(wx, wy) { const S = G.S; return Math.min(RY - 1, Math.max(0, ((wy / S.H) * RY) | 0)) * RX + Math.min(RX - 1, Math.max(0, ((wx / S.W) * RX) | 0)); },
    center(r) { const S = G.S; return [((r % RX) + 0.5) * S.W / RX, (((r / RX) | 0) + 0.5) * S.H / RY]; },
    radius() { const S = G.S; return Math.min(S.W / RX, S.H / RY) * 0.62; },
    neighbours(r) { const cx = r % RX, cy = (r / RX) | 0, out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < RX && y < RY) out.push(y * RX + x); } return out; },
    // full statistics pass (cells sampled 1 in 2, animals all)
    update() {
      const S = G.S, T = G.T, NS = G.NSP, terr = S.terr, veg = S.veg, reg = S.regionOf;
      if (!reg) return;
      const st = {
        cells: new Int32Array(NR), water: new Int32Array(NR), forest: new Int32Array(NR), open: new Int32Array(NR), burnt: new Int32Array(NR), rock: new Int32Array(NR),
        food: new Float32Array(NR), veg: new Float32Array(NR), pop: new Int32Array(NR * NS), genes: new Float32Array(NR * NS * NGR), sick: new Int32Array(NR),
        moist: S.climate ? S.climate.moist : new Float32Array(NR).fill(0.6), day: S.time / G.DAY,
      };
      for (let c = 0; c < terr.length; c += 2) {
        const r = reg[c], tt = terr[c];
        st.cells[r]++;
        if (tt === T.WATER || tt === T.DEEP || tt === T.REEDS) st.water[r]++;
        else if (tt === T.FOREST) st.forest[r]++;
        else if (tt === T.GRASS || tt === T.TALL || tt === T.FLOWERS) { st.open[r]++; st.food[r] += veg[c]; }
        else if (tt === T.BURNT) st.burnt[r]++;
        else if (tt === T.ROCK) st.rock[r]++;
        if (tt === T.BUSH || tt === T.FOREST) st.food[r] += veg[c] * 0.6;
        st.veg[r] += veg[c];
      }
      for (let r = 0; r < NR; r++) { st.veg[r] /= Math.max(1, st.cells[r]); st.food[r] /= Math.max(1, st.cells[r]); }
      const G5 = [S.GENES[4], S.GENES[5], S.GENES[6], S.GENES[7], S.GENES[8]];
      for (let i = 0; i < S.hw; i++) {
        if (!S.alive[i]) continue;
        const t = S.type[i];
        if (G.UFL[t] & G.F.STATIC) continue;
        const r = R.at(S.x[i], S.y[i]);
        st.pop[r * NS + t]++;
        const o = (r * NS + t) * NGR;
        for (let g = 0; g < NGR; g++) st.genes[o + g] += G5[g][i];
        if (S.stats.sick[i] > 0) st.sick[r]++;
      }
      for (let k = 0; k < NR * NS; k++) { const n = st.pop[k]; if (n) for (let g = 0; g < NGR; g++) st.genes[k * NGR + g] /= n; }
      S.regionStats = st;
      return st;
    },
    // regions where a species lives, sorted by numbers
    rangeOf(t) { const st = G.S.regionStats, NS = G.NSP, out = []; if (!st) return out; for (let r = 0; r < NR; r++) if (st.pop[r * NS + t] > 0) out.push(r); return out; },
  });
  G.bus.on('reset', () => { if (G.S.terr) R.rebuild(); });
})();
