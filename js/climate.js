'use strict';
// ============================================================================
//  Long-term climate. On top of daily weather (eco.js), the valley goes
//  through persistent regimes lasting one to several years (wet years,
//  droughts, cold spells, hot years). The climate sets:
//    - the temperature (season + regime + events),
//    - the rain frequency (S.rainK), the soil moisture of every region,
//    - plant growth per region (S.regGrow), cold / heat stress (S.coldK, S.heatK),
//    - fire danger (S.fireK),
//  and slowly reshapes the land: lakes shrink in long droughts and refill in
//  wet years (within their original basin), dry regions turn to bare earth,
//  green ones recover.
// ============================================================================
(function () {
  const REGIMES = {
    normal: { name: 'climat ordinaire', temp: 0, wet: 0 },
    humide: { name: 'années humides', temp: -0.5, wet: 0.45 },
    sec: { name: 'années sèches', temp: 1, wet: -0.45 },
    froid: { name: 'période froide', temp: -3.5, wet: 0.05 },
    chaud: { name: 'années chaudes', temp: 2.5, wet: -0.2 },
  };
  const BASE_T = [11, 20, 11, -1];          // mean temperature per season (°C)
  const BASE_RAIN = [1, 0.8, 1.05, 1];      // relative rain frequency
  const C = (G.climate = {
    REGIMES,
    init() {
      const S = G.S, NR = G.regions.NR;
      S.climate = { regime: 'normal', left: 365 + G.rand() * 365, tempAnom: 0, wetAnom: 0, moist: new Float32Array(NR).fill(0.6), dry: new Float32Array(NR), wetDays: new Float32Array(NR), years: [] };
      // the original water basin: lakes can refill up to where they once were
      S.basin = new Uint8Array(S.terr.length);
      for (let c = 0; c < S.terr.length; c++) if (S.terr[c] === G.T.WATER || S.terr[c] === G.T.DEEP || S.terr[c] === G.T.REEDS) S.basin[c] = 1;
      C.apply(0);
    },
    // anomalies from events (heatwave +8 °C, harsh winter −9 °C…) are added by the director
    apply(evTemp = 0, evWet = 0) {
      const S = G.S, cl = S.climate;
      if (!cl) return;
      const se = S.season(), rg = REGIMES[cl.regime];
      const day = S.time / G.DAY, doy = day % 364;
      // smooth seasonal curve + regime (eased in) + events
      const seasonal = 10 + 10 * Math.sin((doy / 364) * Math.PI * 2 - 0.25) - (se === 3 ? 2 : 0);
      cl.tempAnom += (rg.temp - cl.tempAnom) * 0.02;
      cl.wetAnom += (rg.wet - cl.wetAnom) * 0.02;
      S.temp = seasonal + cl.tempAnom + evTemp;
      S.rainK = Math.max(0.05, BASE_RAIN[se] * (1 + cl.wetAnom + evWet));
      // plant growth follows soil moisture, frost and heat
      const NR = G.regions.NR;
      for (let r = 0; r < NR; r++) {
        const m = cl.moist[r];
        let g = 0.15 + 1.15 * Math.min(1, m / 0.6) ** 0.8;
        if (S.temp > 28) g *= 0.7; if (S.temp < 0) g *= 0.5;
        S.regGrow[r] = g;
      }
      S.coldK = 1 + Math.max(0, 2 - S.temp) / 9;
      S.heatK = 1 + Math.max(0, S.temp - 24) / 10;
      let mAvg = 0; for (let r = 0; r < NR; r++) mAvg += cl.moist[r]; mAvg /= NR;
      S.fireK = Math.max(0.3, (1 + Math.max(0, S.temp - 18) / 10) * (1.4 - mAvg));
    },
    // once a day: soil moisture balance, regime changes, land transformation
    daily(dayN) {
      const S = G.S, cl = S.climate, st = S.regionStats;
      if (!cl) return;
      const NR = G.regions.NR;
      // regime: persistent, with memory (a dry spell tends to last)
      cl.left -= 1;
      if (cl.left <= 0) {
        const prev = cl.regime;
        const r = G.rand();
        let next = r < 0.42 ? 'normal' : r < 0.6 ? 'humide' : r < 0.76 ? 'sec' : r < 0.88 ? 'chaud' : 'froid';
        if (G.rand() < 0.3) next = prev; // persistence
        cl.regime = next; cl.left = (next === 'normal' ? 300 : 200) + G.rand() * 500;
        if (next !== prev) G.bus.emit('climate', { from: prev, to: next });
      }
      // soil water balance: moisture relaxes toward an equilibrium set by the regime, the rain that
      // actually fell today, the temperature and the open water nearby (events push it further)
      const rainToday = S.rainAcc || 0; S.rainAcc = 0;
      for (let r = 0; r < NR; r++) {
        const wf = st ? st.water[r] / Math.max(1, st.cells[r]) : 0.05;
        const target = Math.max(0.05, Math.min(0.95, 0.5 + cl.wetAnom * 0.7 + (rainToday - 0.08) * 2 - Math.max(0, S.temp - 15) / 30 + Math.min(0.25, wf * 2)));
        let m = cl.moist[r] + (target - cl.moist[r]) * 0.03 + rainToday * 0.04;
        m = Math.max(0.03, Math.min(1, m));
        cl.moist[r] = m;
        cl.dry[r] = m < 0.22 ? cl.dry[r] + 1 : Math.max(0, cl.dry[r] - 2);
        cl.wetDays[r] = m > 0.78 ? cl.wetDays[r] + 1 : Math.max(0, cl.wetDays[r] - 2);
      }
      if (dayN % 7 === 0) C.reshape();
      if (dayN % 364 === 0 && dayN > 0) {
        let m = 0; for (let r = 0; r < NR; r++) m += cl.moist[r];
        cl.years.push({ y: Math.round(dayN / 364), regime: cl.regime, moist: m / NR, temp: cl.tempAnom });
        if (cl.years.length > 200) cl.years.shift();
      }
    },
    // slow, durable changes of the land (once a week)
    reshape() {
      const S = G.S, T = G.T, cl = S.climate, terr = S.terr, veg = S.veg, reg = S.regionOf, TW = S.TW, TH = S.TH;
      let changed = 0;
      const NX = [1, -1, 0, 0], NY = [0, 0, 1, -1];
      for (let k = 0; k < terr.length / 40; k++) {
        const c = (G.rand() * terr.length) | 0, r = reg[c], tt = terr[c];
        const x = c % TW, y = (c / TW) | 0;
        let water = 0, land = 0;
        for (let d = 0; d < 4; d++) { const nx = x + NX[d], ny = y + NY[d]; if (nx < 0 || ny < 0 || nx >= TW || ny >= TH) continue; const n = terr[ny * TW + nx]; if (n === T.WATER || n === T.DEEP) water++; else land++; }
        // drought of more than ~2 months: lake shores retreat, then deep water becomes shallow
        if (cl.dry[r] > 60) {
          if (tt === T.WATER && land >= 1 && G.rand() < 0.5) { terr[c] = T.MUD; veg[c] = 0.1; changed++; }
          else if (tt === T.DEEP && land >= 1 && G.rand() < 0.15) { terr[c] = T.WATER; changed++; }
          else if (tt === T.REEDS && G.rand() < 0.4) { terr[c] = T.MUD; changed++; }
          else if ((tt === T.GRASS || tt === T.TALL) && veg[c] < 0.25 && cl.dry[r] > 150 && G.rand() < 0.35) { terr[c] = T.DIRT; changed++; }   // desertification
          else if (tt === T.DIRT && cl.dry[r] > 300 && G.rand() < 0.15) { terr[c] = T.SAND; changed++; }
          else if (tt === T.FOREST && cl.dry[r] > 220 && S.tAge[c] > 6 && G.rand() < 0.08) { terr[c] = T.GRASS; S.tvar[c] |= 4; S.tAge[c] = 0; changed++; } // old trees die of drought
        }
        // wet years: the basin refills, mud greens up
        if (cl.wetDays[r] > 30 || cl.moist[r] > 0.7) {
          if (S.basin[c] && (tt === T.MUD || tt === T.GRASS || tt === T.DIRT || tt === T.TALL) && water >= 1 && G.rand() < 0.6) { terr[c] = T.WATER; veg[c] = 0.4; changed++; }
          else if (S.basin[c] && tt === T.WATER && land === 0 && G.rand() < 0.1) { terr[c] = T.DEEP; changed++; }
          else if ((tt === T.DIRT || tt === T.SAND) && G.rand() < 0.3) { terr[c] = T.GRASS; veg[c] = 0.4; changed++; }
          else if (tt === T.MUD && !water && G.rand() < 0.3) { terr[c] = T.GRASS; veg[c] = 0.5; changed++; }
        }
      }
      if (changed) {
        S.objDirty = true; S.terrDirty = true; S.fieldsDirty = true;
        if (S.fxw) S.fxw.evacuate('thirst', 0.2);
      }
      return changed;
    },
    describe() {
      const S = G.S, cl = S.climate;
      if (!cl) return '';
      let m = 0; for (const v of cl.moist) m += v; m /= cl.moist.length;
      return `${REGIMES[cl.regime].name} · ${S.temp.toFixed(0)} °C · sols ${m < 0.25 ? 'très secs' : m < 0.45 ? 'secs' : m < 0.7 ? 'frais' : 'détrempés'}`;
    },
  });
  G.bus.on('day', ({ d }) => C.daily(d));
  G.bus.on('reset', () => { if (G.S.terr && G.regions) C.init(); });
  G.bus.on('generated', () => { G.regions.update(); C.init(); });
})();
