'use strict';
// ============================================================================
//  Collective migrations. Every week, each population compares its region
//  with the others (food per mouth, water, predators for prey, prey for
//  predators, soil moisture) and part of it may leave:
//   - crisis migrations (famine, drought, danger), in groups for social species,
//   - seasonal migrations of migratory species (summer / winter ranges),
//   - colonisation of empty territories by expanding species.
//  Moved animals get a new home in the destination region: regional
//  populations, territories, predation and gene flow all change for real.
// ============================================================================
(function () {
  const MIGRATORY = ['deer', 'bison', 'duck', 'crow'];
  const M = (G.migration = {
    isMigratory: (t) => MIGRATORY.some((k) => G.U[k] === t),
    // how good region r is for species t right now (higher = better)
    score(t, r, opts = {}) {
      const S = G.S, st = S.regionStats, NS = G.NSP, U = G.UNITS[t];
      if (!st || st.cells[r] < 4) return 0;
      const wf = st.water[r] / st.cells[r];
      // can the species even live there? (water species need water, squirrels need trees)
      if ((U.hab === G.HB.WATER || U.hab === G.HB.AMPHI || U.hab === G.HB.SHORE) && wf < 0.01) return 0;
      if (t === G.U.squirrel && st.forest[r] < 5) return 0;
      const here = st.pop[r * NS + t];
      const water = U.thirst >= 50 ? 1 : wf > 0.01 ? 1 : G.regions.neighbours(r).some((n) => st.water[n] > 4) ? 0.55 : 0.15;
      if (G.PREY[t]) {
        let prey = 0; for (let q = 0; q < NS; q++) if ((G.PREY[t] | S.spMod[t].extraPrey) & (1 << q)) prey += st.pop[r * NS + q];
        return (prey / (here * 6 + 4)) * water;
      }
      let mouths = 0, danger = 0;
      for (let q = 0; q < NS; q++) {
        const n = st.pop[r * NS + q];
        if (!n) continue;
        if (!G.PREY[q] && !(G.UFL[q] & (G.F.STATIC | G.F.AIR))) mouths += n * (G.UNITS[q].r * G.UNITS[q].r) / 10;
        if (G.PREY[q] & (1 << t)) danger += n;
      }
      let food = st.food[r] * st.cells[r] / (mouths + 20);
      if (opts.winter) food = (st.forest[r] / st.cells[r] + 0.2) * (st.food[r] + 0.2) * 40 / (mouths + 20); // shelter matters in winter
      return Math.sqrt(food) * water * (0.5 + st.moist[r]) / (1 + danger * 3 / (here + 5));
    },
    // move part of the population of t living in region `from` to region `to`
    move(t, from, to, frac, kind, why) {
      const S = G.S, out = [];
      const [cx, cy] = G.regions.center(to), rad = G.regions.radius() * 0.8, social = G.UFL[t] & (G.F.HERD | G.F.PACK);
      for (let i = 0; i < S.hw; i++) {
        if (!S.alive[i] || S.type[i] !== t || G.regions.at(S.x[i], S.y[i]) !== from) continue;
        // social animals leave together; solitary ones each decide (bold & curious leave first)
        const p = social ? frac : frac * (0.6 + S.stats.tCur[i] * 0.4 + S.stats.tBold[i] * 0.3);
        if (G.rand() > p) continue;
        if (S.sendTo(i, cx + (G.rand() - 0.5) * rad, cy + (G.rand() - 0.5) * rad, rad * 0.6, `part avec les siens vers ${G.regions.name(to)} (${why})`)) out.push(i);
      }
      if (out.length) {
        const mem = S.migMem || (S.migMem = {});
        mem[t + ':' + from] = S.time / G.DAY;
        G.bus.emit('migration', { t, from, to, n: out.length, kind, why, x: cx, y: cy });
      }
      return out.length;
    },
    best(t, except, opts) {
      let b = -1, bs = 0;
      for (let r = 0; r < G.regions.NR; r++) { if (r === except) continue; const s = M.score(t, r, opts); if (s > bs) { bs = s; b = r; } }
      return [b, bs];
    },
    // crisis: species t (or every herbivore if t is null) leave region r (or their worst region if r < 0)
    crisis(t, r, why) {
      const S = G.S, st = S.regionStats, NS = G.NSP;
      if (!st) return 0;
      let total = 0;
      const species = t != null ? [t] : [...Array(NS).keys()].filter((q) => G.events.animalSp(q) && !G.PREY[q] && !(G.UFL[q] & G.F.AIR));
      for (const q of species) {
        let from = r;
        if (from == null || from < 0) { let w = 1e9; for (let k = 0; k < G.regions.NR; k++) if (st.pop[k * NS + q] >= 3) { const s = M.score(q, k); if (s < w) { w = s; from = k; } } }
        if (from == null || from < 0 || st.pop[from * NS + q] < 2) continue;
        const [to, bs] = M.best(q, from);
        if (to < 0 || bs < M.score(q, from) * 1.3) continue;
        total += M.move(q, from, to, 0.35 + G.rand() * 0.35, 'crisis', why);
      }
      return total;
    },
    // migratory species: autumn → winter range (shelter), spring → summer pastures
    seasonal(t) {
      const S = G.S, st = S.regionStats, NS = G.NSP, se = S.season();
      if (!st || (se !== 0 && se !== 2)) return null;
      let from = -1, n = 0;
      for (let r = 0; r < G.regions.NR; r++) if (st.pop[r * NS + t] > n) { n = st.pop[r * NS + t]; from = r; }
      if (from < 0 || n < 6) return null;
      const winter = se === 2;
      const [to, bs] = M.best(t, from, { winter });
      if (to < 0 || bs < M.score(t, from, { winter }) * 1.1) return null;
      const moved = M.move(t, from, to, 0.75, 'seasonal', winter ? 'quartiers d\'hiver' : 'pâturages d\'été');
      return moved ? { n: moved, from, to, why: winter ? 'vers ses quartiers d\'hiver' : 'vers les pâturages d\'été' } : null;
    },
    // expanding species send pioneers into empty but suitable regions next to their range
    colonize(t, k) {
      const S = G.S, st = S.regionStats, NS = G.NSP;
      if (!st) return 0;
      const range = G.regions.rangeOf(t);
      const cand = [];
      for (const r of range) for (const nb of G.regions.neighbours(r)) if (st.pop[nb * NS + t] === 0 && !cand.includes(nb) && M.score(t, nb) > 0.05) cand.push(nb);
      let n = 0;
      for (const to of cand.sort(() => G.rand() - 0.5).slice(0, k)) {
        const from = G.regions.neighbours(to).filter((r) => st.pop[r * NS + t] > 3).sort((a, b) => st.pop[b * NS + t] - st.pop[a * NS + t])[0];
        if (from != null) n += M.move(t, from, to, 0.25, 'colonize', 'à la conquête de nouveaux territoires');
      }
      return n;
    },
    // weekly check of every population
    weekly() {
      const S = G.S, st = S.regionStats, NS = G.NSP, day = S.time / G.DAY;
      if (!st) return;
      const mem = S.migMem || (S.migMem = {});
      for (let t = 0; t < NS; t++) {
        if (!G.events.animalSp(t) || G.UFL[t] & G.F.AIR || G.UNITS[t].hab === G.HB.WATER || !S.counts[t]) continue;
        for (let r = 0; r < G.regions.NR; r++) {
          const n = st.pop[r * NS + t];
          if (n < 4 || day - (mem[t + ':' + r] || -999) < 45) continue;
          const here = M.score(t, r), [to, bs] = M.best(t, r);
          // leave only when it is clearly worse here (with some inertia: animals stay attached to their land)
          if (to < 0 || bs < here * 2.2 || here > 0.9) continue;
          const st2 = S.climate ? S.climate.moist[r] : 0.5;
          const why = G.PREY[t] ? 'les proies manquent' : st2 < 0.2 ? 'la sécheresse' : st.water[r] < 3 ? 'le manque d\'eau' : 'le manque de nourriture';
          M.move(t, r, to, 0.25 + G.rand() * 0.3, 'crisis', why);
        }
      }
    },
  });
  G.bus.on('day', ({ d }) => { if (d % 7 === 3) M.weekly(); });
})();
