'use strict';
// Tests of the living-world systems (director, events, chains, migrations, powers, long runs)
module.exports = function ({ test, assert, world, runDays, animals, sane, quick, YEAR }) {
  const S = G.S, U = G.U, T = G.T;
  const countT = (tt) => S.terr.reduce((a, v) => a + (v === tt), 0);

  test('chaque événement du catalogue peut se déclencher sans casser le monde', () => {
    const ok = [], skipped = [];
    for (const def of G.EVENTS) {
      world(2024, { water: 0.6, forest: 0.45 });
      runDays(8);
      const sp = def.perSpecies ? [U.rabbit, U.deer, U.mouse, U.fish].find((t) => S.counts[t] > 0) : undefined;
      const ctx = { source: 'player', sp };
      if (def.id === 'recolonisation' || def.id === 'regionalExtinction') ctx.r = 0;
      if (def.id === 'adaptation' || def.id === 'divergence') { skipped.push(def.id); continue; } // need years of genetic history
      const ev = G.director.trigger(def.id, ctx);
      runDays(def.id === 'eruption' ? 6 : 4);
      sane();
      (ev ? ok : skipped).push(def.id);
    }
    assert(ok.length >= 24, `only ${ok.length} events could start: ${ok.join(', ')}`);
    return `${ok.length} déclenchés, non applicables ici : ${skipped.join(', ')}`;
  });

  test('effets réels : sécheresse, inondation, incendie, séisme', () => {
    world(31, { water: 0.8, forest: 0.5 });
    runDays(5);
    const w0 = countT(T.WATER);
    G.director.trigger('drought', { source: 'player' });
    assert(countT(T.WATER) < w0, 'drought did not dry any water');
    world(31, { water: 0.8, forest: 0.5 }); runDays(5);
    const w1 = countT(T.WATER);
    G.director.trigger('flood', { source: 'player' });
    assert(countT(T.WATER) > w1, 'flood did not spread water');
    world(31, { water: 0.8, forest: 0.5 }); runDays(5);
    G.director.trigger('wildfire', { source: 'player' }); runDays(2);
    assert(countT(T.BURNT) > 0, 'fire did not burn');
    world(31, { water: 0.8, forest: 0.5 }); runDays(5);
    const r0 = countT(T.ROCK) + countT(T.DIRT);
    G.director.trigger('earthquake', { source: 'player' });
    assert(countT(T.ROCK) + countT(T.DIRT) > r0, 'quake left no crack');
    return 'ok';
  });

  test('chaînes de conséquences (pluies torrentielles → crue, fin → suites)', () => {
    world(57, { water: 0.8 }); runDays(5);
    const ev = G.director.trigger('deluge', { source: 'player' });
    assert(ev, 'deluge failed');
    let tries = 0;
    while (!S.director.queue.length && tries++ < 30) { G.chains.fromEnded(ev); }
    assert(S.director.queue.length > 0, 'no consequence was queued');
    const ids = S.director.queue.map((q) => q.id);
    S.director.queue.forEach((q) => { q.day = 0; });
    runDays(2);
    sane();
    return `conséquences programmées : ${ids.join(', ')}`;
  });

  test('migrations collectives', () => {
    world(88, { water: 0.5 }); runDays(10);
    let moved = 0, reports = [];
    const off = G.bus.on('migration', (m) => { moved += m.n; reports.push(`${G.UNITS[m.t].k} ${m.n}`); });
    // starve a region: its herbivores must leave
    const st = S.regionStats, NS = G.NSP;
    let r = 0, best = 0; for (let k = 0; k < G.regions.NR; k++) { let n = 0; for (let t = 0; t < NS; t++) if (!G.PREY[t]) n += st.pop[k * NS + t]; if (n > best) { best = n; r = k; } }
    const [cx, cy] = G.regions.center(r);
    S.fxw.vegAdd(cx, cy, G.regions.radius() * 1.2, -1);
    G.regions.update();
    G.migration.crisis(null, r, 'test');
    off();
    assert(moved > 0, 'nobody migrated from a starved region');
    runDays(6); sane();
    return reports.join(', ');
  });

  test('directeur : plusieurs seeds, événements variés et rares', () => {
    const years = quick ? 1 : 3, seeds = quick ? [1, 2] : [1, 2, 3, 4];
    const lines = [], allIds = new Set();
    for (const seed of seeds) {
      world(seed);
      const t0 = Date.now();
      runDays(YEAR * years);
      sane();
      const d = S.director, n = d.started;
      for (const k in d.count) allIds.add(k);
      assert(n < 80 * years, `too many events (${n})`);
      assert(d.active.length <= 7, 'too many simultaneous events');
      const majors = Object.keys(d.count).filter((k) => G.EVENT[k].major).reduce((a, k) => a + d.count[k], 0);
      assert(majors <= 3 * years, `too many major events (${majors})`);
      lines.push(`seed ${seed}: ${n} évts (${Object.entries(d.count).map(([k, v]) => k + '×' + v).join(' ')}), ${animals()} animaux, ${((Date.now() - t0) / 1000 / years).toFixed(0)} s/an`);
    }
    console.log('      ' + lines.join('\n      '));
    assert(allIds.size >= 4, 'not enough variety');
    return `${allIds.size} types d'événements différents`;
  });

  test('grande population (performance)', () => {
    world(4242, { water: 0.6 });
    for (let k = 0; k < 2500; k++) { const x = 20 + G.rand() * (S.W - 40), y = 20 + G.rand() * (S.H - 40); if (S.okAt(U.rabbit, x, y)) S.spawn(U.rabbit, x, y); }
    S.buildGrid();
    const n = animals(), t0 = Date.now();
    S.setTimeScale(4); for (let k = 0; k < 600; k++) S.step(); S.setTimeScale(1);
    const ms = (Date.now() - t0) / 600;
    sane();
    assert(ms < 25, `step too slow: ${ms.toFixed(1)} ms`);
    return `${n} animaux, ${ms.toFixed(2)} ms par pas`;
  });

  if (G.powers) test('pouvoirs divins', () => {
    world(7, { water: 0.5, forest: 0.4 }); runDays(5);
    const done = [], failed = [];
    for (const p of G.POWERS) {
      const x = S.W * 0.5, y = S.H * 0.5;
      const r = G.powers.use(p.id, { x, y, sp: U.deer, gene: 4 }, true);
      (r && r.ok ? done : failed).push(p.id + (r && r.ok ? '' : `(${r && r.msg})`));
      runDays(0.5);
      sane();
    }
    assert(done.length >= G.POWERS.length - 2, `failed: ${failed.join(', ')}`);
    runDays(10); sane();
    return `${done.length}/${G.POWERS.length} pouvoirs${failed.length ? ` — refusés : ${failed.join(', ')}` : ''}`;
  });

  if (!quick) test('simulation longue (10 ans)', () => {
    world(99);
    const t0 = Date.now();
    runDays(YEAR * 10);
    sane();
    const json = G.save.serialize();
    G.save.deserialize(json);
    runDays(10); sane();
    return `${animals()} animaux, ${S.history.length} entrées de chronique, ${S.director.started} événements, ${((Date.now() - t0) / 1000).toFixed(0)} s`;
  });
};
