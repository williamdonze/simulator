'use strict';
// ============================================================================
//  Chains of consequences.
//  1. Scheduled consequences: when an event ends, each entry of its `chain`
//     list ([id, probability, minDelay, maxDelay]) may be queued. When due, the
//     consequence is tried again against the CURRENT state of the world: it
//     only happens if its target still exists (e.g. no flood without water),
//     and some (renewal) keep checking until the world has really recovered.
//  2. Reactive consequences: facts published on the bus by the simulation
//     (extinction, return, regional disappearance, large migrations, climate
//     regime change, divine interventions) become events in their own right.
//  3. Interactions: events can reinforce or cancel each other (`interact`).
// ============================================================================
(function () {
  const C = (G.chains = {
    // queue a consequence (ctx carries the region / species of the cause)
    schedule(id, delay, ctx) {
      const D = G.S.director;
      if (!D || D.queue.length > 60) return;
      D.queue.push({ id, day: G.S.time / G.DAY + delay, ctx: Object.assign({ chained: true }, ctx || {}), tries: 0 });
    },
    fromEnded(ev) {
      const def = G.EVENT[ev.id];
      for (const [id, p, a, b] of def.chain || []) if (G.rand() < p) C.schedule(id, a + G.rand() * (b - a), { r: ev.r, sp: ev.sp, cause: ev.uid });
    },
    // due consequences: try them; renewals that are not ready yet are retried later
    process(day) {
      const D = G.S.director;
      for (let k = D.queue.length - 1; k >= 0; k--) {
        const q = D.queue[k];
        if (q.day > day) continue;
        D.queue.splice(k, 1);
        const ev = G.director.trigger(q.id, q.ctx);
        if (!ev && G.EVENT[q.id] && G.EVENT[q.id].chainOnly && q.tries < 6) { q.tries++; q.day = day + 60 + G.rand() * 60; D.queue.push(q); }
      }
    },
    // how simultaneous events affect each other
    interact(ev) {
      const D = G.director;
      // rain puts out droughts and fires early; a drought makes a heatwave worse
      if (ev.id === 'deluge' || ev.id === 'wetPeriod') { for (const a of D.list()) if (a.id === 'drought' || a.id === 'heatwave') a.until = Math.min(a.until, G.S.time / G.DAY + 2); }
      if (ev.id === 'heatwave' && D.isActive('drought')) for (const a of D.list()) if (a.id === 'drought') a.until += 20;
      if (ev.id === 'harshWinter') for (const a of D.list()) if (a.id === 'parasites') a.until = Math.min(a.until, G.S.time / G.DAY + 5); // frost kills parasites
    },
  });
  // ------------------------------------------------ reactive consequences
  G.bus.on('extinction', ({ t }) => G.director && G.director.trigger('extinction', { sp: t }));
  G.bus.on('comeback', ({ t }) => G.director && G.director.trigger('recolonisation', { sp: t, r: G.regions.rangeOf(t)[0] || 0 }));
  G.bus.on('regionLost', ({ t, r }) => G.director && G.director.trigger('regionalExtinction', { sp: t, r }));
  G.bus.on('regionGained', ({ t, r }) => G.director && G.director.trigger('recolonisation', { sp: t, r }));
  G.bus.on('migration', (rep) => { if (rep.n >= 15 && rep.kind !== 'seasonal' && G.director) G.director.trigger('massMigration', { sp: rep.t, report: rep }); });
  G.bus.on('climate', ({ to }) => {
    if (!G.director) return;
    if (to === 'sec') C.schedule('drought', 30 + G.rand() * 90, {});
    if (to === 'humide') C.schedule('wetPeriod', 10 + G.rand() * 40, {});
    if (to === 'froid') C.schedule('harshWinter', 60 + G.rand() * 200, {});
    if (to === 'chaud') C.schedule('heatwave', 30 + G.rand() * 120, {});
  });
})();
