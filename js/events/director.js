'use strict';
// ============================================================================
//  Event director. Every day it reads the world (metrics), then:
//   - advances the active events (progressive effects, early ends),
//   - fires the consequences that are due (chains.js),
//   - draws new events from the catalogue with probabilities that depend on
//     the real situation (risk of fire, famine, epidemic, overpopulation…),
//   - paces the story: after a major crisis comes a calm period; long calm
//     periods slowly raise the tension. Rare events stay rare.
//  Every 5 ticks it aggregates the modifiers of the active events into the
//  climate (temperature, rain, plant growth, cold / heat stress, fire, wind).
//  Limits: 5 simultaneous events, 1 major at a time, per-event and
//  per-species cooldowns, incompatible pairs.
// ============================================================================
(function () {
  const MAX_ACTIVE = 5;
  const INCOMPATIBLE = [['drought', 'wetPeriod'], ['drought', 'deluge'], ['drought', 'flood'], ['heatwave', 'harshWinter'], ['heatwave', 'deluge'], ['wildfire', 'deluge']];
  const incompatible = (a, b) => INCOMPATIBLE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const D = (G.director = {
    reset() {
      G.S.director = { active: [], cool: {}, queue: [], calm: 0, tension: 0, uid: 0, presence: null, count: {}, started: 0 };
    },
    list: () => G.S.director.active,
    isActive: (id) => G.S.director.active.some((e) => e.id === id),
    // aggregated modifiers → climate & simulation (called every 5 ticks)
    tick(dt) {
      const S = G.S, d = S.director;
      if (!d) return;
      S.rainAcc = (S.rainAcc || 0) + S.rain * (dt || 0) / G.DAY; // rain that fell today (soil water balance)
      let temp = 0, wet = 0, grow = 1, fire = 1, cold = 1, heat = 1, rain = 1, wind = 0;
      for (const ev of d.active) {
        const def = G.EVENT[ev.id];
        if (!def.mods) continue;
        const m = def.mods(ev);
        temp += m.temp || 0; wet += m.wet || 0; grow *= m.grow || 1; fire *= m.fire || 1; cold *= m.cold || 1; heat *= m.heat || 1; rain *= m.rain || 1; wind = Math.max(wind, m.wind || 0);
      }
      if (G.climate) G.climate.apply(temp + (S.godTemp || 0), wet + (S.godWet || 0));
      S.growK = grow; S.fireK = (S.fireK || 1) * fire; S.coldK = (S.coldK || 1) * cold; S.heatK = (S.heatK || 1) * heat; S.rainK = (S.rainK || 1) * rain * (S.godRain || 1);
      S.wind = wind;
    },
    daily(day) {
      const S = G.S, d = S.director;
      if (!d) return;
      if (day % 3 === 0 || !S.regionStats) { G.regions.update(); D.trackRegions(); }
      G.metrics.snapshot(day);
      const m = G.metrics.compute();
      if (!m) return;
      // 1. active events
      for (let k = d.active.length - 1; k >= 0; k--) {
        const ev = d.active[k], def = G.EVENT[ev.id];
        ev.age = day - ev.t0;
        if (def.daily) def.daily(ev, m);
        if (day >= ev.until || (def.done && def.done(ev, m))) { d.active.splice(k, 1); D.finish(ev, m); }
      }
      // 2. consequences that are due
      G.chains.process(day);
      // 3. new events, paced
      d.tension = Math.min(1, d.tension + 1 / 700);
      const calm = day < d.calm;
      for (const def of G.EVENTS) {
        if (def.forcedOnly || def.chainOnly) continue;
        if (def.perSpecies) { for (let t = 0; t < G.NSP; t++) if (m.pop[t] > 0 && G.events.animalSp(t)) D.roll(def, m, { sp: t }, calm, day); }
        else D.roll(def, m, {}, calm, day);
      }
    },
    roll(def, m, ctx, calm, day) {
      const d = G.S.director;
      if (d.active.length >= MAX_ACTIVE) return;
      const key = def.id + (ctx.sp != null ? ':' + ctx.sp : '');
      if ((d.cool[key] || 0) > day || (d.cool[def.id + ':all'] || 0) > day) return;
      let p = def.when(m, ctx);
      if (!(p > 0)) return;
      if (def.major) p *= calm ? 0.1 : 0.5 + d.tension;
      if (G.rand() < p) D.trigger(def.id, ctx);
    },
    // start an event now (from the director, a chain or the player). Returns the instance or null.
    trigger(id, ctx0 = {}) {
      let ctx = ctx0;
      const S = G.S, d = S.director, def = G.EVENT[id];
      if (!d || !def) return null;
      const day = S.time / G.DAY, player = ctx.source === 'player';
      const key = id + (ctx.sp != null ? ':' + ctx.sp : '');
      if (!player && (d.cool[key] || 0) > day) return null;
      if (!player && d.active.length >= MAX_ACTIVE + 2) return null;
      if (!player && d.active.some((a) => incompatible(a.id, id) || (a.id === id && (!def.perSpecies || a.sp === ctx.sp)))) return null;
      if (def.major && !player && d.active.some((a) => G.EVENT[a.id].major)) return null;
      const m = S.metrics || G.metrics.compute() || { pop: S.counts, risk: { epidemic: [], overpop: [], extinction: [], migration: [] } };
      // a per-species consequence without a species: pick the one for which it really applies
      if (def.perSpecies && ctx.sp == null && S.metrics) {
        let best = -1, bp = 0;
        for (let t = 0; t < G.NSP; t++) { if (!G.events.animalSp(t) || !S.counts[t]) continue; const p = def.when(m, Object.assign({}, ctx, { sp: t })); if (p > bp) { bp = p; best = t; } }
        if (best < 0) return null;
        ctx = Object.assign({}, ctx, { sp: best });
      }
      if (def.perSpecies && ctx.sp == null) return null;
      if (def.needWhen && !player && !(def.when(m, ctx) > 0)) return null; // a consequence only happens if the world really is in that state
      const tgt = def.target(m, ctx);
      if (!tgt) return null;
      const ev = Object.assign({ uid: ++d.uid, id, t0: day, age: 0, sp: ctx.sp, ctx, source: ctx.source || (ctx.chained ? 'chain' : 'nature'), cause: ctx.cause }, tgt);
      if (ev.r == null) ev.r = -1;
      if (ev.x == null && ev.r >= 0) [ev.x, ev.y] = G.regions.center(ev.r);
      const dur = def.dur(m, ev);
      ev.until = day + (dur || 0);
      const res = def.start(ev, m);
      if (!res) { D.undo(ev); return null; }
      ev.text = res.text; ev.cons = res.cons || [];
      d.cool[key] = day + (def.cooldown || 0);
      d.count[id] = (d.count[id] || 0) + 1;
      d.started++;
      if (def.major) { d.calm = day + 120 + G.rand() * 240; d.tension = 0; }
      G.chains.interact(ev);
      if (dur > 0) d.active.push(ev); else D.finish(ev, m, true);
      G.bus.emit('event', ev);
      return ev;
    },
    finish(ev, m, instant) {
      const def = G.EVENT[ev.id];
      D.undo(ev);
      const txt = def.end ? def.end(ev, m || G.S.metrics) : null;
      if (txt && !instant) G.bus.emit('eventEnd', Object.assign({}, ev, { endText: txt }));
      G.chains.fromEnded(ev);
    },
    // undo temporary modifiers (species, prey switching, zones)
    undo(ev) {
      const S = G.S;
      for (const [t, k, mul] of ev.revert || []) S.spMod[t][k] /= mul;
      for (const [t, old] of ev.revertPrey || []) S.spMod[t].extraPrey = old;
      if (ev.zones) S.zones = S.zones.filter((z) => !ev.zones.includes(z));
      ev.revert = ev.revertPrey = ev.zones = null;
    },
    // which species live in which region: losses and returns become events
    trackRegions() {
      const S = G.S, st = S.regionStats, d = S.director, NS = G.NSP, NR = G.regions.NR, day = S.time / G.DAY;
      if (!st) return;
      if (!d.presence) { d.presence = new Float32Array(NR * NS).fill(-1); d.lost = new Float32Array(NR * NS).fill(-1); for (let k = 0; k < NR * NS; k++) if (st.pop[k] > 0) d.presence[k] = day; return; }
      for (let r = 0; r < NR; r++) for (let t = 0; t < NS; t++) {
        const k = r * NS + t;
        if (!G.events.animalSp(t) || G.UFL[t] & G.F.AIR) continue;
        if (st.pop[k] >= 3 || (st.pop[k] > 0 && d.lost[k] < 0)) {
          if (d.lost[k] >= 0 && day - d.lost[k] > 60 && st.pop[k] >= 2 && S.counts[t] > 0) G.bus.emit('regionGained', { t, r });
          d.lost[k] = -1; if (st.pop[k] >= 3) d.presence[k] = day;
        } else if (st.pop[k] === 0 && d.presence[k] >= 0 && d.lost[k] < 0 && day - d.presence[k] > 30) {
          d.lost[k] = day;
          if (S.counts[t] > 0) G.bus.emit('regionLost', { t, r });
        }
      }
    },
  });
  G.bus.on('reset', () => D.reset());
  G.bus.on('day', ({ d }) => D.daily(d));
})();
