'use strict';
// ============================================================================
//  Boot & main loop (fixed-step simulation, interpolated rendering)
// ============================================================================
(function () {
  const S = G.S, R = G.R, ui = G.ui;
  try {
    G.buildAtlas();
    R.init(document.getElementById('gl'));
  } catch (err) {
    document.getElementById('err').textContent = 'Erreur : ' + err.message;
    document.getElementById('err').style.display = 'block';
    throw err;
  }
  G.initWorld(...ui.worldForScreen());
  R.initWorld();
  ui.init();
  R.resize();
  ui.fitCamera();

  let last = performance.now(), acc = 0, simMs = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let simDt = 0;
    if (S.phase === 'battle' && ui.running) {
      acc += dt * ui.speed;
      const maxSteps = ui.speed > 2 ? 8 : 4;
      let steps = 0;
      const t0 = performance.now();
      while (acc >= G.DT && steps < maxSteps) {
        S.step();
        acc -= G.DT;
        steps++;
        // keep the page responsive when the simulation is too heavy
        if (performance.now() - t0 > 45) { acc = 0; break; }
      }
      if (steps >= maxSteps) acc = Math.min(acc, G.DT);
      const ms = performance.now() - t0;
      if (steps) simMs = simMs * 0.85 + (ms / steps) * 0.15;
      simDt = dt * ui.speed;
    } else if (S.phase === 'deploy') {
      // keep grid/team counts fresh for the HUD
      if ((now | 0) % 4 === 0) S.buildGrid();
    }
    const alpha = S.phase === 'battle' && ui.running ? Math.min(1, acc / G.DT) : 1;
    R.draw(alpha, dt, simDt);
    ui.update();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  G.debug = { S, R };
})();
