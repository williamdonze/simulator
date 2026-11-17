'use strict';
// ============================================================================
//  World indicators read by the event director (computed once a day, cheap):
//  populations and their trends, births / deaths and causes over 30 days,
//  food, water, soil moisture, temperature, biomes, predator / prey balance,
//  genetic diversity, and derived RISKS (famine, epidemic, fire, overpopulation,
//  extinction, migration pressure, imbalance).
// ============================================================================
(function () {
  const MEM = 400; // days of memory
  const M = (G.metrics = {
    reset() { G.S.dirMem = []; G.S.metrics = null; },
    // a light snapshot of the day (kept ~1 year)
    snapshot(d) {
      const S = G.S, NS = G.NSP, mem = S.dirMem || (S.dirMem = []);
      const starved = new Int32Array(NS), killed = new Int32Array(NS), dead = new Int32Array(NS);
      for (const k in S.tally.deaths) {
        const a = S.tally.deaths[k];
        for (let t = 0; t < NS; t++) { dead[t] += a[t]; if (k === 'hunger' || k === 'thirst') starved[t] += a[t]; if (k === 'killed') killed[t] += a[t]; }
      }
      mem.push({ d, counts: Int32Array.from(S.counts), births: Int32Array.from(S.tally.births), dead, starved, killed });
      if (mem.length > MEM) mem.shift();
    },
    ago(days) { const mem = G.S.dirMem || []; return mem.length ? mem[Math.max(0, mem.length - 1 - days)] : null; },
    compute() {
      const S = G.S, NS = G.NSP, U = G.U, F = G.F, st = S.regionStats, mem = S.dirMem || [];
      if (!st || !mem.length) return null;
      const now = mem[mem.length - 1], m30 = M.ago(30), m90 = M.ago(90), m365 = M.ago(364);
      const NR = G.regions.NR;
      const m = {
        d: now.d, season: S.season(), temp: S.temp, regime: S.climate ? S.climate.regime : 'normal',
        pop: now.counts, pop30: m30.counts, pop90: m90.counts, pop365: m365.counts,
        births30: new Int32Array(NS), dead30: new Int32Array(NS), starved30: new Int32Array(NS), killed30: new Int32Array(NS),
        total: 0, herb: 0, pred: 0, nSpecies: 0, moist: 0, moistMin: 1, food: 0, water: 0, forest: 0, burnt: 0, cells: 0,
        dens: new Float32Array(NS), regionsOf: new Int32Array(NS), geneVar: new Float32Array(NS),
        risk: { famine: 0, fire: 0, imbalance: 0, epidemic: new Float32Array(NS), overpop: new Float32Array(NS), extinction: new Float32Array(NS), migration: new Float32Array(NR) },
      };
      for (let t = 0; t < NS; t++) {
        m.births30[t] = now.births[t] - m30.births[t]; m.dead30[t] = now.dead[t] - m30.dead[t];
        m.starved30[t] = now.starved[t] - m30.starved[t]; m.killed30[t] = now.killed[t] - m30.killed[t];
        if (G.UFL[t] & (F.STATIC | F.HIDDEN) || t === U.bee) continue;
        const n = m.pop[t];
        m.total += n; m.total365 = (m.total365 || 0) + m.pop365[t];
        if (n) m.nSpecies++;
        if (G.PREY[t]) m.pred += n; else m.herb += n;
      }
      for (let r = 0; r < NR; r++) {
        m.moist += st.moist[r]; m.moistMin = Math.min(m.moistMin, st.moist[r]);
        m.food += st.food[r] * st.cells[r]; m.water += st.water[r]; m.forest += st.forest[r]; m.burnt += st.burnt[r]; m.cells += st.cells[r];
      }
      m.moist /= NR; m.food /= Math.max(1, m.cells); m.waterF = m.water / m.cells; m.forestF = m.forest / m.cells; m.burntF = m.burnt / m.cells;
      // density (densest region) and range of every species
      const perRegion = m.cells / NR;
      for (let t = 0; t < NS; t++) {
        let mx = 0, nr = 0;
        for (let r = 0; r < NR; r++) { const p = st.pop[r * NS + t]; if (p > mx) mx = p; if (p > 0) nr++; }
        m.dens[t] = mx / (perRegion / 60); m.regionsOf[t] = nr;
      }
      // genetic diversity: spread of the physical genes
      const sum = new Float32Array(NS * 5), sq = new Float32Array(NS * 5), cnt = new Int32Array(NS);
      for (let i = 0; i < S.hw; i += 1) {
        if (!S.alive[i]) continue;
        const t = S.type[i]; cnt[t]++;
        for (let g = 0; g < 5; g++) { const v = S.GENES[4 + g][i]; sum[t * 5 + g] += v; sq[t * 5 + g] += v * v; }
      }
      for (let t = 0; t < NS; t++) if (cnt[t] > 1) { let v = 0; for (let g = 0; g < 5; g++) { const mu = sum[t * 5 + g] / cnt[t]; v += sq[t * 5 + g] / cnt[t] - mu * mu; } m.geneVar[t] = v / 5; }
      // ------------------------------------------------ risks (0 … 1)
      const cl = (v) => Math.max(0, Math.min(1, v));
      let herbStarved = 0;
      for (let t = 0; t < NS; t++) if (!G.PREY[t] && m.pop[t]) herbStarved += m.starved30[t];
      m.risk.famine = cl(herbStarved / Math.max(10, m.herb) * 6 + (0.4 - m.food) * 2 + (0.35 - m.moist));
      m.risk.fire = cl((S.fireK - 1) * 0.7 + (0.4 - m.moist) * 1.2 + (m.season === 1 ? 0.15 : 0));
      const ratio = m.pred / Math.max(1, m.herb);
      m.risk.imbalance = cl(ratio > 0.06 ? (ratio - 0.06) * 12 : 0);
      for (let t = 0; t < NS; t++) {
        const n = m.pop[t];
        if (!n || G.UFL[t] & (F.STATIC | F.HIDDEN) || t === U.bee) continue;
        const growth = n / Math.max(5, m.pop90[t]);
        m.risk.overpop[t] = cl((growth - 1.6) * 0.5 + m.starved30[t] / n * 3 + (m.dens[t] - 3) * 0.08);
        m.risk.epidemic[t] = cl((m.dens[t] - 2) * 0.12 + (n > 80 ? 0.2 : 0) + (m.moist > 0.6 && m.temp > 12 ? 0.1 : 0));
        m.risk.extinction[t] = n < 12 ? cl(1 - n / 12 + (m.pop90[t] > n ? 0.2 : 0)) : 0;
      }
      // migration pressure: many mouths and little food in a region
      for (let r = 0; r < NR; r++) {
        let herb = 0; for (let t = 0; t < NS; t++) if (!G.PREY[t] && !(G.UFL[t] & (F.STATIC | F.AIR))) herb += st.pop[r * NS + t];
        m.risk.migration[r] = cl(herb / Math.max(1, st.food[r] * st.cells[r]) * 1.5 - 0.3 + (st.moist[r] < 0.2 ? 0.3 : 0));
      }
      S.metrics = m;
      return m;
    },
  });
  G.bus.on('reset', () => M.reset());
})();
