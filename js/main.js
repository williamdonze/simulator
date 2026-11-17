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
    // river and lake
    for (let y = 0; y <= 1.02; y += 0.01) P(0.72 + Math.sin(y * 5) * 0.03, y, 9, T.WATER);
    P(0.78, 0.42, 48, T.WATER); P(0.79, 0.42, 30, T.DEEP); P(0.7, 0.5, 18, T.REEDS); P(0.84, 0.32, 14, T.REEDS);
    // forests
    for (let k = 0; k < 26; k++) P(0.08 + rnd() * 0.3, 0.08 + rnd() * 0.45, 18 + rnd() * 16, T.FOREST);
    for (let k = 0; k < 10; k++) P(0.85 + rnd() * 0.15, 0.65 + rnd() * 0.35, 16 + rnd() * 12, T.FOREST);
    // meadows
    for (let k = 0; k < 10; k++) P(0.42 + rnd() * 0.22, 0.62 + rnd() * 0.3, 16 + rnd() * 10, T.FLOWERS);
    for (let k = 0; k < 8; k++) P(0.4 + rnd() * 0.25, 0.1 + rnd() * 0.3, 18 + rnd() * 10, T.TALL);
    for (let k = 0; k < 10; k++) P(0.15 + rnd() * 0.35, 0.55 + rnd() * 0.4, 9 + rnd() * 6, T.BUSH);
    for (let k = 0; k < 4; k++) P(0.9 + rnd() * 0.08, 0.08 + rnd() * 0.15, 8 + rnd() * 8, T.ROCK);
    P(0.62, 0.5, 10, T.MUD);
    const put = (k, n, x0, y0, x1, y1) => {
      for (let c = 0, t = 0; c < n && t < n * 40; t++) {
        const x = (x0 + rnd() * (x1 - x0)) * W, y = (y0 + rnd() * (y1 - y0)) * H;
        if (S.okAt(U[k], x, y)) { S.spawn(U[k], x, y); c++; }
      }
    };
    put('rabbit', 30, 0.35, 0.3, 0.65, 0.9); put('mouse', 20, 0.4, 0.1, 0.65, 0.4); put('squirrel', 10, 0.08, 0.08, 0.38, 0.5);
    put('deer', 14, 0.3, 0.3, 0.6, 0.7); put('boar', 6, 0.15, 0.5, 0.4, 0.9); put('bison', 6, 0.45, 0.35, 0.65, 0.6);
    put('beaver', 3, 0.66, 0.3, 0.9, 0.6); put('fox', 4, 0.3, 0.2, 0.6, 0.8); put('wolf', 5, 0.15, 0.3, 0.25, 0.45);
    put('lynx', 2, 0.1, 0.1, 0.35, 0.45); put('bear', 2, 0.55, 0.4, 0.68, 0.6);
    put('eagle', 2, 0.2, 0.2, 0.8, 0.8); put('owl', 2, 0.1, 0.1, 0.4, 0.5); put('vulture', 2, 0.3, 0.3, 0.7, 0.7); put('crow', 6, 0.3, 0.2, 0.7, 0.8);
    put('duck', 6, 0.7, 0.35, 0.86, 0.5); put('heron', 2, 0.68, 0.3, 0.9, 0.55); put('fish', 25, 0.7, 0.3, 0.88, 0.55); put('frog', 8, 0.66, 0.42, 0.74, 0.58);
    put('butterfly', 10, 0.42, 0.62, 0.64, 0.92);
    S.spawn(U.hive, 0.47 * W, 0.7 * H); S.spawn(U.hive, 0.58 * W, 0.84 * H);
    S.buildGrid();
    ui.toast('globe|Une vallée vivante : regarde la chaîne alimentaire s\'équilibrer. Essaie aussi le voyage dans le temps.');
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
    if (ui.skipping) {
      ui.skipStep();
      R.draw(1, dt, 0);
      ui.update(now);
      requestAnimationFrame(frame);
      return;
    }
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
