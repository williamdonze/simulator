'use strict';
// ============================================================================
//  Boot, example world & main loop (fixed-step simulation, interpolated render)
// ============================================================================
(function () {
  const S = G.S, R = G.R, ui = G.ui, T = G.T, U = G.U;
  try {
    G.buildAtlas();
    R.init(document.getElementById('gl'));
  } catch (err) {
    const e = document.getElementById('err');
    e.textContent = 'Erreur : ' + err.message; e.style.display = 'block';
    throw err;
  }

  // a ready-made valley: lake, river, forest, meadows, and a full food web
  G.demo = function () {
    const [w, h] = ui.worldForScreen();
    if (w !== S.W || h !== S.H) { G.initWorld(w, h); R.initWorld(); ui.fitCamera(); } else S.clearAll();
    R.clearDecals();
    const W = S.W, H = S.H, rnd = Math.random;
    const P = (x, y, r, t) => S.paintTerrain(x * W, y * H, r, t);
    const sc = W / 900;
    // river and lake
    for (let y = 0; y <= 1.02; y += 0.01) P(0.72 + Math.sin(y * 5) * 0.03, y, 9, T.WATER);
    P(0.78, 0.42, 48 * sc, T.WATER); P(0.79, 0.42, 30 * sc, T.DEEP); P(0.7, 0.5, 18 * sc, T.REEDS); P(0.84, 0.32, 14 * sc, T.REEDS);
    // forests
    for (let k = 0; k < 26; k++) P(0.08 + rnd() * 0.3, 0.08 + rnd() * 0.45, (14 + rnd() * 12) * sc, T.FOREST);
    for (let k = 0; k < 10; k++) P(0.85 + rnd() * 0.15, 0.65 + rnd() * 0.35, (12 + rnd() * 10) * sc, T.FOREST);
    // meadows
    for (let k = 0; k < 10; k++) P(0.42 + rnd() * 0.22, 0.62 + rnd() * 0.3, (13 + rnd() * 8) * sc, T.FLOWERS);
    for (let k = 0; k < 8; k++) P(0.4 + rnd() * 0.25, 0.1 + rnd() * 0.3, (14 + rnd() * 8) * sc, T.TALL);
    for (let k = 0; k < 10; k++) P(0.15 + rnd() * 0.35, 0.55 + rnd() * 0.4, (8 + rnd() * 5) * sc, T.BUSH);
    for (let k = 0; k < 4; k++) P(0.9 + rnd() * 0.08, 0.08 + rnd() * 0.15, (7 + rnd() * 6) * sc, T.ROCK);
    P(0.62, 0.5, 10, T.MUD);
    const put = (k, n, x0, y0, x1, y1) => {
      for (let c = 0, t = 0; c < n && t < n * 40; t++) {
        const x = (x0 + rnd() * (x1 - x0)) * W, y = (y0 + rnd() * (y1 - y0)) * H;
        if (S.okAt(U[k], x, y)) { S.spawn(U[k], x, y); c++; }
      }
    };
    const k = Math.max(0.5, Math.min(1.5, W * H / (900 * 500)));
    const n = (v) => Math.max(1, Math.round(v * k));
    put('rabbit', n(18), 0.35, 0.3, 0.65, 0.9); put('mouse', n(12), 0.4, 0.1, 0.65, 0.4); put('squirrel', n(7), 0.08, 0.08, 0.38, 0.5);
    put('deer', n(9), 0.3, 0.3, 0.6, 0.7); put('boar', n(4), 0.15, 0.5, 0.4, 0.9); put('bison', n(4), 0.45, 0.35, 0.65, 0.6);
    put('beaver', 2, 0.66, 0.3, 0.9, 0.6); put('fox', n(3), 0.3, 0.2, 0.6, 0.8); put('wolf', 4, 0.15, 0.3, 0.25, 0.45);
    put('lynx', 2, 0.1, 0.1, 0.35, 0.45); put('bear', 2, 0.55, 0.4, 0.68, 0.6);
    put('eagle', 2, 0.2, 0.2, 0.8, 0.8); put('owl', 2, 0.1, 0.1, 0.4, 0.5); put('vulture', 2, 0.3, 0.3, 0.7, 0.7); put('crow', n(4), 0.3, 0.2, 0.7, 0.8);
    put('duck', n(4), 0.7, 0.35, 0.86, 0.5); put('heron', 2, 0.68, 0.3, 0.9, 0.55); put('fish', n(16), 0.7, 0.3, 0.88, 0.55); put('frog', n(6), 0.66, 0.42, 0.74, 0.58);
    put('butterfly', n(6), 0.42, 0.62, 0.64, 0.92);
    S.spawn(U.hive, 0.47 * W, 0.7 * H); S.spawn(U.hive, 0.58 * W, 0.84 * H);
    S.buildGrid();
    ui.toast('🌍 Une vallée vivante : regarde la chaîne alimentaire s\'équilibrer. Astuce : 🔍 Loupe dans Outils.');
  };

  G.initWorld(...ui.worldForScreen());
  R.initWorld();
  ui.init();
  R.resize();
  ui.fitCamera();
  window.addEventListener('resize', () => R.resize());

  let last = performance.now(), acc = 0, frameN = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let simDt = 0;
    if (ui.running) {
      acc += dt * ui.speed;
      const t0 = performance.now();
      let steps = 0;
      while (acc >= G.DT && steps < 24) {
        S.step(); acc -= G.DT; steps++;
        if (performance.now() - t0 > 28) { acc = 0; break; }
      }
      if (steps >= 24) acc = Math.min(acc, G.DT);
      simDt = dt * Math.min(ui.speed, 4);
    } else if ((frameN++ & 7) === 0) S.buildGrid();
    R.draw(ui.running ? Math.min(1, acc / G.DT) : 1, dt, simDt);
    ui.update(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
