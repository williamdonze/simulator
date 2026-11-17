'use strict';
// ============================================================================
//  Ready-made scenarios
// ============================================================================
(function () {
  const S = G.S, T = G.T;
  const U = (k) => G.U[k];

  // fill a rectangle with a hex lattice of units
  function fill(k, tm, x0, y0, w, h, sp = 1.08) {
    const t = U(k), r = G.UR[t];
    const s = r * 2 * sp, rowH = s * 0.866;
    let row = 0, n = 0;
    for (let y = y0; y < y0 + h; y += rowH, row++) {
      for (let x = x0 + (row & 1 ? s / 2 : 0); x < x0 + w; x += s) {
        if (S.blockedAt(x, y)) continue;
        if (S.spawn(t, tm, x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6) >= 0) n++;
      }
    }
    return n;
  }
  // mirrored helper: x measured from team's own edge
  function side(tm, W) { return tm === 0 ? (x, w) => x : (x, w) => W - x - w; }
  function tRect(tt, x0, y0, w, h) {
    for (let y = y0; y < y0 + h; y += 4) for (let x = x0; x < x0 + w; x += 4) S.paintTerrain(x, y, 4, tt);
  }
  function tCircle(tt, cx, cy, r) { S.paintTerrain(cx, cy, r, tt); }
  function tBlob(tt, cx, cy, r, n = 7) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, d = Math.random() * r * 0.6;
      S.paintTerrain(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r * (0.4 + Math.random() * 0.4), tt);
    }
  }
  function tLine(tt, x0, y0, x1, y1, r) {
    const l = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(l / (r * 0.5));
    for (let k = 0; k <= n; k++) S.paintTerrain(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, r, tt);
  }
  function river(tt, x, H, amp, r) {
    const f = (y) => x + Math.sin((y - H / 2) * 0.006) * amp + Math.sin((y - H / 2) * 0.017) * amp * 0.3;
    let px = f(0), py = 0;
    for (let y = 0; y <= H + 20; y += 20) {
      const nx = f(y);
      tLine(tt, px, py, nx, y, r);
      px = nx; py = y;
    }
  }
  function build(k, tm, x, y) { return S.spawn(U(k), tm, x, y); }

  const LIST = [
    {
      name: 'Grande bataille rangée', size: 'M', desc: '~16 000 soldats : infanterie, tireurs, cavalerie, siège, rois.',
      run() {
        const W = S.W, H = S.H, cy = H / 2;
        tBlob(T.FOREST, W / 2, 180, 120); tBlob(T.FOREST, W / 2, H - 180, 120);
        tBlob(T.TALL, W / 2 - 200, cy, 90); tBlob(T.MUD, W / 2 + 160, cy + 120, 70);
        for (const tm of [0, 1]) {
          const X = side(tm, W);
          const fy = cy - 330, fh = 660;
          fill('shield', tm, X(560, 40), fy, 40, fh);
          fill('spear', tm, X(500, 50), fy, 50, fh);
          fill('soldier', tm, X(420, 70), fy, 70, fh);
          fill('knight', tm, X(380, 34), fy + 120, 34, fh - 240);
          fill('barbarian', tm, X(380, 34), fy, 34, 110);
          fill('berserk', tm, X(380, 34), fy + fh - 110, 34, 110);
          fill('archer', tm, X(290, 80), fy, 80, fh);
          fill('xbow', tm, X(250, 34), fy + 60, 34, fh - 120);
          fill('musket', tm, X(215, 30), fy + 140, 30, fh - 280);
          fill('mage', tm, X(185, 24), fy + 220, 24, fh - 440);
          fill('monk', tm, X(160, 20), fy + 100, 20, fh - 200, 2.4);
          fill('drummer', tm, X(330, 12), fy, 12, fh, 4);
          fill('cavalry', tm, X(330, 160), fy - 260, 160, 160);
          fill('harcher', tm, X(330, 160), fy + fh + 100, 160, 130);
          fill('catapult', tm, X(70, 30), cy - 300, 30, 600, 2.6);
          fill('cannon', tm, X(115, 22), cy - 200, 22, 400, 2.8);
          fill('grenadier', tm, X(460, 26), fy + 200, 26, fh - 400);
          build('king', tm, X(150, 0), cy);
          fill('sniper', tm, X(40, 20), cy - 120, 20, 240, 2);
        }
      },
    },
    {
      name: 'Siège du château', size: 'L', desc: 'Une forteresse bleue entourée de murailles face à une armée de siège rouge.',
      run() {
        const W = S.W, H = S.H, cx = W - 620, cy = H / 2;
        river(T.WATER, W - 1150, H, 60, 26);
        tBlob(T.FOREST, 700, 250, 200, 10); tBlob(T.FOREST, 800, H - 250, 200, 10);
        tBlob(T.TALL, 1200, cy, 160, 8);
        // walls (ring with towers)
        const R = 360;
        for (let a = 0; a < Math.PI * 2; a += 0.004) {
          const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * 0.85;
          S.paintTerrain(x, y, 9, T.WALL);
        }
                tLine(T.ROAD, cx, cy, cx - R - 200, cy, 10);
        // gate = palisade segment
        for (let y = -26; y <= 26; y += 4) S.paintTerrain(cx - R, cy + y, 9, T.PALI);
        build('castle', 1, cx + 40, cy);
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2; build(k % 2 ? 'tower' : 'magetower', 1, cx + Math.cos(a) * (R - 40), cy + Math.sin(a) * (R - 40) * 0.85); }
        build('temple', 1, cx + 40, cy - 190); build('barracks', 1, cx + 40, cy + 190);
        build('range', 1, cx - 170, cy - 140); build('stable', 1, cx - 170, cy + 140);
        build('bastion', 1, cx - 260, cy - 60); build('bastion', 1, cx - 260, cy + 60);
        fill('archer', 1, cx - 310, cy - 250, 80, 170); fill('archer', 1, cx - 310, cy + 80, 80, 170);
        fill('archer', 1, cx - 120, cy - 290, 200, 50); fill('archer', 1, cx - 120, cy + 240, 200, 50);
        fill('knight', 1, cx - 200, cy - 80, 70, 160);
        fill('spear', 1, cx - 250, cy - 100, 50, 200);
        fill('shield', 1, cx - 300, cy - 70, 30, 140);
        fill('xbow', 1, cx + 180, cy - 140, 50, 280);
        fill('musket', 1, cx - 30, cy - 230, 140, 40); fill('musket', 1, cx - 30, cy + 190, 140, 40);
        fill('monk', 1, cx - 100, cy - 120, 30, 240, 2.4);
        fill('drummer', 1, cx - 150, cy - 150, 10, 300, 5);
        build('king', 1, cx + 120, cy);
        S.stance[1] = 1; // defenders hold the fortress
        // attackers
        fill('soldier', 0, 940, cy - 400, 100, 800);
        fill('shield', 0, 1030, cy - 300, 40, 600);
        fill('archer', 0, 760, cy - 380, 100, 760);
        fill('ram', 0, 1100, cy - 100, 40, 200, 2.4);
        fill('sapper', 0, 1080, cy - 340, 30, 120); fill('sapper', 0, 1080, cy + 220, 30, 120);
        fill('catapult', 0, 420, cy - 420, 40, 840, 2.6);
        fill('cannon', 0, 520, cy - 300, 30, 600, 2.8);
        fill('ballista', 0, 600, cy - 200, 30, 400, 2.8);
        fill('cavalry', 0, 760, 160, 150, 110); fill('cavalry', 0, 760, H - 270, 150, 110);
        fill('grenadier', 0, 870, cy - 200, 26, 400);
        fill('ninja', 0, 700, cy - 60, 20, 120);
        fill('monk', 0, 700, cy - 300, 20, 600, 2.4);
        build('tent', 0, 300, cy); build('workshop', 0, 300, cy - 220); build('barracks', 0, 300, cy + 220);
        build('king', 0, 380, cy);
      },
    },
    {
      name: 'Forêt en feu', size: 'M', desc: 'Lance-flammes et mages rouges contre une armée bleue retranchée dans la forêt.',
      run() {
        const W = S.W, H = S.H;
        tRect(T.FOREST, W / 2 - 100, 60, W / 2 - 60, H - 120);
        tRect(T.TALL, W / 2 - 360, 60, 260, H - 120);
        tBlob(T.WATER, W / 2 + 300, H / 2, 120, 6);
        fill('flamer', 0, 500, H / 2 - 400, 50, 800);
        fill('mage', 0, 420, H / 2 - 300, 40, 600);
        fill('soldier', 0, 560, H / 2 - 450, 60, 900);
        fill('grenadier', 0, 380, H / 2 - 300, 30, 600);
        fill('knight', 1, W / 2 + 120, H / 2 - 450, 80, 900);
        fill('archer', 1, W / 2 + 220, H / 2 - 450, 140, 900);
        fill('spear', 1, W / 2 + 60, H / 2 - 450, 50, 900);
        for (let k = 0; k < 30; k++) build('barrel', 4, W / 2 - 340 + Math.random() * 240, 100 + Math.random() * (H - 200));
        build('hut', 1, W - 300, H / 2 - 200); build('hut', 1, W - 300, H / 2); build('hut', 1, W - 300, H / 2 + 200);
      },
    },
    {
      name: 'Le pont', size: 'M', desc: 'Une rivière infranchissable et un seul pont : goulet d\'étranglement garanti.',
      run() {
        const W = S.W, H = S.H;
        river(T.DEEP, W / 2, H, 30, 40);
        tRect(T.ROAD, W / 2 - 90, H / 2 - 30, 180, 60);
        tRect(T.ROAD, 0, H / 2 - 12, W, 24);
        tRect(T.WATER, W / 2 - 90, 200, 180, 60);
        tRect(T.WATER, W / 2 - 90, H - 260, 180, 60);
        for (const tm of [0, 1]) {
          const X = side(tm, W);
          fill('soldier', tm, X(500, 300), H / 2 - 350, 300, 700);
          fill('archer', tm, X(860, 120), H / 2 - 300, 120, 600);
          fill('knight', tm, X(700, 80), H / 2 - 200, 80, 400);
          fill('cannon', tm, X(1000, 30), H / 2 - 200, 30, 400, 2.6);
          build('tower', tm, X(W / 2 - 200, 0), H / 2 - 80);
          build('tower', tm, X(W / 2 - 200, 0), H / 2 + 80);
        }
      },
    },
    {
      name: 'Guerre des villages', size: 'M', desc: 'Deux villages qui produisent leurs armées en continu. Qui tiendra ?',
      run() {
        const W = S.W, H = S.H;
        tBlob(T.FOREST, W / 2, H / 2 - 300, 160); tBlob(T.FOREST, W / 2, H / 2 + 300, 160);
        tRect(T.ROAD, 0, H / 2 - 10, W, 20);
        for (const tm of [0, 1]) {
          const X = side(tm, W);
          for (let k = 0; k < 6; k++) build('hut', tm, X(140 + (k % 2) * 60, 0), 300 + k * 140);
          build('barracks', tm, X(340, 0), H / 2 - 220);
          build('range', tm, X(340, 0), H / 2 + 220);
          build('stable', tm, X(220, 0), H / 2);
          build('temple', tm, X(420, 0), H / 2);
          build('workshop', tm, X(220, 0), 150);
          build('tent', tm, X(220, 0), H - 150);
          build('tower', tm, X(560, 0), H / 2 - 120); build('tower', tm, X(560, 0), H / 2 + 120);
          for (let y = 140; y < H - 140; y += 6) S.paintTerrain(X(640, 0), y, 8, Math.abs(y - H / 2) < 60 ? T.GRASS : T.PALI);
          fill('peasant', tm, X(460, 60), H / 2 - 150, 60, 300);
        }
      },
    },
    {
      name: 'Chaos à 4 équipes', size: 'L', desc: 'Quatre armées aux quatre coins et des barils de poudre au centre.',
      run() {
        const W = S.W, H = S.H;
        const kinds = [['soldier', 'archer', 'cavalry', 'mage'], ['knight', 'xbow', 'harcher', 'grenadier'], ['barbarian', 'musket', 'ninja', 'flamer'], ['spear', 'archer', 'berserk', 'catapult']];
        const corners = [[250, 200], [W - 650, 200], [250, H - 600], [W - 650, H - 600]];
        for (let tm = 0; tm < 4; tm++) {
          const [cx, cy] = corners[tm];
          const k = kinds[tm];
          fill(k[0], tm, cx, cy, 400, 160);
          fill(k[1], tm, cx, cy + 170, 400, 110);
          fill(k[2], tm, cx, cy + 290, 400, 70);
          fill(k[3], tm, cx + 100, cy + 370, 200, 30, k[3] === 'catapult' ? 2.6 : 1.1);
          build('king', tm, cx + 200, cy + 420);
          build('castle', tm, tm % 2 ? cx + 520 : cx - 150, tm < 2 ? cy - 60 : cy + 460);
        }
        tBlob(T.SAND, W / 2, H / 2, 220);
        for (let k = 0; k < 60; k++) { const a = Math.random() * 6.28, d = Math.random() * 180; build('barrel', 4, W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d * 0.7); }
        tBlob(T.FOREST, W / 2, 200, 140); tBlob(T.FOREST, W / 2, H - 200, 140);
        tBlob(T.WATER, 200, H / 2, 120); tBlob(T.WATER, W - 200, H / 2, 120);
      },
    },
    {
      name: 'Test de charge : 50 000', size: 'XL', desc: '25 000 contre 25 000. Pour mesurer les performances de ta machine.',
      run() {
        const W = S.W, H = S.H;
        for (const tm of [0, 1]) {
          const X = side(tm, W);
          fill('soldier', tm, X(600, 620), 140, 620, H - 280);
          fill('archer', tm, X(300, 260), 140, 260, H - 280);
        }
      },
    },
  ];
  G.SCENARIOS = LIST;
})();
