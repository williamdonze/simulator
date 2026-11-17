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

  // a new random world (see worldgen.js); opts can fix the seed, water, forest, predators
  G.demo = function (opts) {
    const [w, h] = ui.worldForScreen();
    if (w !== S.W || h !== S.H) { G.initWorld(w, h); R.initWorld(); ui.fitCamera(); } else S.clearAll();
    R.clearDecals();
    const info = G.generate(opts || {});
    S.world.opts = Object.assign({}, opts || {}, { seed: info.seed });
    ui.toast(`globe|Monde n° ${info.seed} : ${info.desc}.`);
    return info;
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
      const tk = ui.tk(), sdt = G.DT * tk;
      S.setTimeScale(tk);
      const t0 = performance.now();
      let steps = 0;
      while (acc >= sdt && steps < 24) {
        S.step(); acc -= sdt; steps++;
        if (performance.now() - t0 > 28) { acc = 0; break; }
      }
      if (steps >= 24) acc = Math.min(acc, sdt);
      simDt = dt * Math.min(ui.speed, 4);
    } else if ((frameN++ & 7) === 0) S.buildGrid();
    R.draw(ui.running ? Math.min(1, acc / (G.DT * ui.tk())) : 1, dt, simDt);
    ui.update(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
