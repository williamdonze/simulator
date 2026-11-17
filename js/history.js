'use strict';
// ============================================================================
//  World memory: the chronicle (events with title, text, severity, date,
//  place and consequences), the history sheet of every species (first
//  appearance, peak, extinctions, returns, adaptations, events), and the
//  remarkable individuals (founders, great ancestors, last survivors,
//  catastrophe survivors, rare mutants). Light archive: no trajectories,
//  only facts and aggregated statistics.
// ============================================================================
(function () {
  const MAXH = 600;
  const H = (G.history = {
    reset() { const S = G.S; S.history = []; S.notables = []; S.spHist = []; for (let t = 0; t < G.NSP; t++) S.spHist.push({ first: -1, peak: 0, peakD: 0, ext: [], back: [], traits: [], events: [] }); },
    add(e) {
      const S = G.S;
      const entry = Object.assign({ d: S.time / G.DAY, icon: 'scroll', title: '', text: '', sev: 1, r: -1, cons: [] }, e);
      S.history.push(entry);
      if (S.history.length > MAXH) {
        // forget minor facts first
        const k = S.history.findIndex((h) => h.sev <= 1);
        S.history.splice(k >= 0 ? k : 0, 1);
      }
      G.bus.emit('chronicle', entry);
      return entry;
    },
    notable(i, kind, note) {
      const S = G.S;
      if (i < 0 || !S.alive[i]) return null;
      const key = S.nameI[i];
      if (S.notables.some((n) => n.key === key && n.kind === kind)) return null;
      const n = { key, i, kind, sp: S.type[i], name: S.nameOf(i), d: S.time / G.DAY, note, alive: true, x: S.x[i], y: S.y[i] };
      S.notables.push(n);
      if (S.notables.length > 80) S.notables.splice(S.notables.findIndex((a) => !a.alive), 1);
      S.mark[i] = 1;
      if (S.log) S.log(i, `entre dans l'histoire : ${note}`);
      return n;
    },
    speciesTrait(t, txt) { G.S.spHist[t].traits.push({ d: G.S.time / G.DAY, txt }); },
    daily(day) {
      const S = G.S, NS = G.NSP;
      for (let t = 0; t < NS; t++) {
        const h = S.spHist[t], c = S.counts[t];
        if (c > 0 && h.first < 0) h.first = day;
        if (c > h.peak) { h.peak = c; h.peakD = day; }
      }
      for (const n of S.notables) {
        if (!n.alive) continue;
        if (!(S.alive[n.i] && S.nameI[n.i] === n.key)) { n.alive = false; n.death = day; }
        else { n.x = S.x[n.i]; n.y = S.y[n.i]; }
      }
      if (day % 7 !== 0) return;
      // last of its kind
      for (let t = 0; t < NS; t++) {
        if (S.counts[t] !== 1 || !G.events.animalSp(t)) continue;
        for (let i = 0; i < S.hw; i++) if (S.alive[i] && S.type[i] === t) { const f = S.fem(t); if (H.notable(i, 'last', `${f ? 'dernière' : 'dernier'} ${G.UNITS[t].name.toLowerCase()} de la vallée`)) H.add({ icon: 'u:' + G.UNITS[t].k, title: 'Le dernier de son espèce', text: `${S.nameOf(i)} est ${f ? 'la dernière' : 'le dernier'} ${G.UNITS[t].name.toLowerCase()} ${f ? 'vivante' : 'vivant'} de la vallée.`, sev: 3, x: S.x[i], y: S.y[i], sp: t }); break; }
      }
      // great ancestors: lineages with many living descendants
      if (day % 28 === 0) {
        const cnt = new Map();
        for (let i = 0; i < S.hw; i++) if (S.alive[i] && S.stats.gen[i] > 2) { const k = S.lineage[i] * 64 + S.type[i]; cnt.set(k, (cnt.get(k) || 0) + 1); }
        for (const [k, n] of cnt) {
          if (n < 30) continue;
          const lin = Math.floor(k / 64), t = k - lin * 64;
          if (S.notables.some((a) => a.key === lin && a.kind === 'ancestor')) { const a = S.notables.find((a) => a.key === lin && a.kind === 'ancestor'); a.note = `ancêtre de ${n} descendants vivants`; continue; }
          const name = S.nameFromSeed(lin);
          S.notables.push({ key: lin, i: -1, kind: 'ancestor', sp: t, name, d: day, note: `ancêtre de ${n} descendants vivants`, alive: false });
          H.add({ icon: 'dna', title: 'Une grande lignée', text: `${n} ${S.plural(t)} ${S.fem(t) ? 'vivantes' : 'vivants'} descendent ${/^[AEIOUÉÈ]/.test(name) ? 'd\'' : 'de '}${name}, fondateur de leur lignée.`, sev: 2, sp: t });
        }
      }
    },
    sheet(t) {
      const S = G.S, h = S.spHist[t];
      return Object.assign({}, h, { now: S.counts[t], notables: S.notables.filter((n) => n.sp === t), events: S.history.filter((e) => e.sp === t).slice(-30) });
    },
  });
  // ------------------------------------------------ what gets written in the chronicle
  const LBL = { climat: 'Climat', catastrophe: 'Catastrophe', 'écologie': 'Écologie', biologie: 'Biologie', 'évolution': 'Évolution' };
  G.bus.on('event', (ev) => {
    const def = G.EVENT[ev.id];
    H.add({ kind: 'event', id: ev.id, uid: ev.uid, icon: def.icon, title: def.name, cat: LBL[def.cat], text: ev.text, sev: def.sev + (ev.source === 'player' ? 0 : 0), x: ev.x, y: ev.y, r: ev.r, cons: ev.cons, sp: ev.sp, source: ev.source });
    if (ev.sp != null && G.S.spHist[ev.sp]) G.S.spHist[ev.sp].events.push(ev.uid);
    if (ev.id === 'extinction') G.S.spHist[ev.sp].ext.push(G.S.time / G.DAY);
    if (ev.id === 'recolonisation' && G.S.spHist[ev.sp]) G.S.spHist[ev.sp].back.push(G.S.time / G.DAY);
  });
  G.bus.on('eventEnd', (ev) => {
    const def = G.EVENT[ev.id];
    H.add({ kind: 'end', id: ev.id, icon: def.icon, title: `Fin : ${def.name.toLowerCase()}`, text: ev.endText, sev: Math.max(1, def.sev - 1), x: ev.x, y: ev.y, r: ev.r, sp: ev.sp });
    // survivors of great catastrophes become part of the story
    if (def.cat === 'catastrophe' && def.sev >= 3 && ev.x != null) {
      const S = G.S;
      let best = -1, ba = -1;
      for (let i = 0; i < S.hw; i++) if (S.alive[i] && G.events.animalSp(S.type[i]) && (S.x[i] - ev.x) ** 2 + (S.y[i] - ev.y) ** 2 < (ev.rad || 100) ** 2 && S.age[i] > ba) { ba = S.age[i]; best = i; }
      if (best >= 0) H.notable(best, 'survivor', `survivant : ${def.name.toLowerCase()}`);
    }
  });
  G.bus.on('generation', ({ t, g }) => { if (g >= 10) H.add({ icon: 'dna', title: 'Lignées', text: `${g}e génération de ${G.S.plural(t)} depuis la création du monde.`, sev: 1, sp: t }); });
  G.bus.on('climate', ({ to }) => H.add({ icon: to === 'sec' || to === 'chaud' ? 'sun' : to === 'humide' ? 'droplets' : to === 'froid' ? 'snow' : 'leaf', title: 'Le climat change', text: `Le climat bascule : ${G.climate.REGIMES[to].name}. Ce régime peut durer plusieurs années.`, sev: 2 }));
  G.bus.on('immigration', ({ t, n, x, y }) => H.add({ icon: 'u:' + G.UNITS[t].k, title: 'Retour d\'une espèce', text: `${n} ${G.S.plural(t)} venu${G.S.e(t)}s d'ailleurs recolonisent la vallée.`, sev: 2, x, y, sp: t }));
  G.bus.on('migration', (m) => { if (m.n >= 6 && m.kind !== 'seasonal' && m.n < 15) H.add({ icon: 'foot', title: 'Migration', text: `${m.n} ${G.S.plural(m.t)} quittent ${G.regions.name(m.from)} pour ${G.regions.name(m.to)} (${m.why}).`, sev: 1, x: m.x, y: m.y, r: m.to, sp: m.t }); });
  G.bus.on('power', (p) => !p.quiet && H.add({ icon: p.icon, title: 'Intervention divine', text: p.text, sev: 2, x: p.x, y: p.y, r: p.x != null ? G.regions.at(p.x, p.y) : -1, source: 'player', cons: p.cons || [] }));
  G.bus.on('reset', () => H.reset());
  G.bus.on('day', ({ d }) => H.daily(d));
})();
