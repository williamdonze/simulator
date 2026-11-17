'use strict';
// Test scenarios (used by the benchmark scripts, not by the page)
(function () {
  const S = G.S;
  function fill(k, tm, x0, y0, w, h, sp = 1.08) {
    const t = G.U[k], r = G.UR[t], s = r * 2 * sp, rowH = s * 0.866;
    let row = 0;
    for (let y = y0; y < y0 + h; y += rowH, row++)
      for (let x = x0 + (row & 1 ? s / 2 : 0); x < x0 + w; x += s) if (!S.blockedAt(x, y)) S.spawn(t, tm, x, y);
  }
  const side = (tm, W) => (tm === 0 ? (x) => x : (x, w) => W - x - w);
  G.SCENARIOS = [
    { name: 'Bataille moderne', size: 'M', run() {
      const W = S.W, H = S.H;
      for (const tm of [0, 1]) {
        const X = side(tm, W);
        fill('rifle', tm, X(520, 120), 200, 120, H - 400);
        fill('mg', tm, X(480, 30), 260, 30, H - 520);
        fill('rpg', tm, X(450, 25), 300, 25, H - 600);
        fill('riot', tm, X(650, 25), 300, 25, H - 600);
        fill('medic', tm, X(420, 20), 300, 20, H - 600, 2.5);
        fill('tank', tm, X(300, 60), 300, 60, H - 600, 2.2);
        fill('jeep', tm, X(380, 40), 150, 40, 150, 1.6);
        fill('apc', tm, X(380, 40), H - 300, 40, 150, 1.6);
        fill('artillery', tm, X(80, 30), 400, 30, H - 800, 2.5);
        fill('aa', tm, X(200, 20), 500, 20, 300, 2.5);
        fill('fpv', tm, X(150, 60), 150, 60, 200, 1.5);
        fill('heli', tm, X(220, 40), 200, 40, 120, 1.8);
        fill('bomber', tm, X(150, 40), H - 300, 40, 120, 1.5);
        S.spawn(G.U.jet, tm, X(40, 0), 100);
        S.spawn(G.U.hq, tm, X(100, 0), H / 2);
        S.spawn(G.U.sam, tm, X(160, 0), H / 2 - 160);
        S.spawn(G.U.bunker, tm, X(700, 0), H / 2);
      }
    } },
    { name: 'Stress 50k', size: 'XL', run() {
      const W = S.W, H = S.H;
      for (const tm of [0, 1]) { const X = side(tm, W); fill('rifle', tm, X(600, 620), 140, 620, H - 280); fill('mg', tm, X(300, 260), 140, 260, H - 280); }
    } },
  ];
})();
