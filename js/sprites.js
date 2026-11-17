'use strict';
// ============================================================================
//  Procedural sprite atlas.
//  Every sprite is drawn twice: in the BASE atlas (team parts drawn in grey,
//  the shader multiplies them by the team colour) and in the MASK atlas
//  (white = team coloured, black = keep base colour).
// ============================================================================
(function () {
  const S = 10; // atlas pixels per world unit (high resolution: stays sharp when zooming in)
  const AW = 4096, AH = 4096;
  const base = document.createElement('canvas');
  const mask = document.createElement('canvas');
  base.width = AW; base.height = AH;
  mask.width = mask.height = 4; // team mask unused in nature mode
  const cb = base.getContext('2d', { willReadFrequently: true });
  const cm = mask.getContext('2d');

  const frames = []; // {name,x,y,w,h (px), ww, wh (world), px, py (pivot 0..1)}
  const FR = {};
  let shelfX = 1, shelfY = 1, shelfH = 0;

  function alloc(pw, ph) {
    pw = Math.ceil(pw) + 4; ph = Math.ceil(ph) + 4;
    if (shelfX + pw > AW) { shelfX = 1; shelfY += shelfH; shelfH = 0; }
    if (shelfY + ph > AH) throw new Error('atlas overflow');
    const r = { x: shelfX + 1, y: shelfY + 1 };
    shelfX += pw; shelfH = Math.max(shelfH, ph);
    return r;
  }

  // ------------------------------------------------------------------ pen
  // Draws simultaneously on base & mask.
  const pen = {
    team: true,
    begin() { cb.beginPath(); cm.beginPath(); return this; },
    moveTo(x, y) { cb.moveTo(x, y); cm.moveTo(x, y); return this; },
    lineTo(x, y) { cb.lineTo(x, y); cm.lineTo(x, y); return this; },
    quad(a, b, c, d) { cb.quadraticCurveTo(a, b, c, d); cm.quadraticCurveTo(a, b, c, d); return this; },
    bez(a, b, c, d, e, f) { cb.bezierCurveTo(a, b, c, d, e, f); cm.bezierCurveTo(a, b, c, d, e, f); return this; },
    arc(x, y, r, a0 = 0, a1 = Math.PI * 2, ccw = false) { cb.arc(x, y, r, a0, a1, ccw); cm.arc(x, y, r, a0, a1, ccw); return this; },
    ell(x, y, rx, ry, rot = 0) { cb.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); cm.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); return this; },
    rect(x, y, w, h) { cb.rect(x, y, w, h); cm.rect(x, y, w, h); return this; },
    rrect(x, y, w, h, r) { cb.roundRect(x, y, w, h, r); cm.roundRect(x, y, w, h, r); return this; },
    close() { cb.closePath(); cm.closePath(); return this; },
    // colour: css string; or number = team shade (1 = pure team colour)
    fill(c) {
      if (typeof c === 'number') { cb.fillStyle = grey(c); cm.fillStyle = '#fff'; }
      else { cb.fillStyle = c; cm.fillStyle = '#000'; }
      cb.fill(); if (this.team) cm.fill();
      return this;
    },
    stroke(c, w) {
      cb.lineWidth = cm.lineWidth = w;
      if (typeof c === 'number') { cb.strokeStyle = grey(c); cm.strokeStyle = '#fff'; }
      else { cb.strokeStyle = c; cm.strokeStyle = '#000'; }
      cb.stroke(); if (this.team) cm.stroke();
      return this;
    },
  };
  function grey(s) {
    const v = Math.max(0, Math.min(255, Math.round(127.5 * s)));
    return `rgb(${v},${v},${v})`;
  }
  function line(x0, y0, x1, y1, c, w) { pen.begin().moveTo(x0, y0).lineTo(x1, y1).stroke(c, w); }
  function circ(x, y, r, c) { pen.begin().arc(x, y, r).fill(c); }
  function ell(x, y, rx, ry, c) { pen.begin().ell(x, y, rx, ry).fill(c); }
  function box(x, y, w, h, c) { pen.begin().rect(x, y, w, h).fill(c); }
  function rbox(x, y, w, h, r, c) { pen.begin().rrect(x, y, w, h, r).fill(c); }
  function poly(pts, c, sc, sw) {
    pen.begin().moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) pen.lineTo(pts[i], pts[i + 1]);
    pen.close();
    if (c != null) pen.fill(c);
    if (sc != null) pen.stroke(sc, sw || 0.3);
  }

  // Register a frame: ww/wh world size, pivot (0..1), draw(ctx coords in world units)
  const OL = '#2b2433';
  const tmpC = document.createElement('canvas');
  const tmpX = tmpC.getContext('2d');
  // cartoon contour: dilate the opaque silhouette behind the sprite
  // cartoon contour: chamfer distance transform of the silhouette, O(n) per sprite,
  // drawn behind the sprite with an anti-aliased edge
  let distBuf = new Float32Array(0);
  function outlinePass(r, pw, ph, t) {
    pw = Math.ceil(pw); ph = Math.ceil(ph);
    const img = cb.getImageData(r.x, r.y, pw, ph);
    const d = img.data, n = pw * ph;
    if (distBuf.length < n) distBuf = new Float32Array(n);
    const D = distBuf, INF = 1e9;
    for (let k = 0; k < n; k++) D[k] = d[k * 4 + 3] > 140 ? 0 : INF;
    const A = 1, B = 1.4142;
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const k = y * pw + x; let v = D[k]; if (v === 0) continue;
      if (x > 0) v = Math.min(v, D[k - 1] + A);
      if (y > 0) { v = Math.min(v, D[k - pw] + A); if (x > 0) v = Math.min(v, D[k - pw - 1] + B); if (x < pw - 1) v = Math.min(v, D[k - pw + 1] + B); }
      D[k] = v;
    }
    for (let y = ph - 1; y >= 0; y--) for (let x = pw - 1; x >= 0; x--) {
      const k = y * pw + x; let v = D[k]; if (v === 0) continue;
      if (x < pw - 1) v = Math.min(v, D[k + 1] + A);
      if (y < ph - 1) { v = Math.min(v, D[k + pw] + A); if (x < pw - 1) v = Math.min(v, D[k + pw + 1] + B); if (x > 0) v = Math.min(v, D[k + pw - 1] + B); }
      D[k] = v;
    }
    const OR = 43, OG = 36, OB = 51;
    for (let k = 0; k < n; k++) {
      const o = k * 4, sa = d[o + 3] / 255;
      if (sa >= 1) continue;
      const oa = Math.max(0, Math.min(1, t + 0.5 - D[k]));
      if (oa <= 0) continue;
      // sprite over outline (straight alpha)
      const ra = sa + oa * (1 - sa);
      d[o] = (d[o] * sa + OR * oa * (1 - sa)) / ra;
      d[o + 1] = (d[o + 1] * sa + OG * oa * (1 - sa)) / ra;
      d[o + 2] = (d[o + 2] * sa + OB * oa * (1 - sa)) / ra;
      d[o + 3] = ra * 255;
    }
    cb.putImageData(img, r.x, r.y);
  }
  let PAD = 0; // extra margin (world units) so nothing gets cropped
  function frame(name, ww0, wh0, pvx0, pvy0, draw0, team = true, ol = team) {
    const pad = PAD;
    const ww = ww0 + pad * 2, wh = wh0 + pad * 2;
    const pvx = (pvx0 * ww0 + pad) / ww, pvy = (pvy0 * wh0 + pad) / wh;
    const draw = pad ? () => { cb.translate(pad, pad); cm.translate(pad, pad); draw0(); } : draw0;
    const pw = Math.ceil(ww * S), ph = Math.ceil(wh * S);
    const r = alloc(pw, ph);
    cb.save(); cm.save();
    cb.translate(r.x, r.y); cm.translate(r.x, r.y);
    cb.beginPath(); cb.rect(0, 0, pw, ph); cb.clip();
    cm.beginPath(); cm.rect(0, 0, pw, ph); cm.clip();
    cb.scale(S, S); cm.scale(S, S);
    cb.lineCap = cm.lineCap = 'round';
    cb.lineJoin = cm.lineJoin = 'round';
    pen.team = team;
    draw();
    pen.team = true;
    cb.restore(); cm.restore();
    if (ol) outlinePass(r, pw, ph, (ol === 'thin' ? 0.3 : 0.45) * S);
    FR[name] = frames.length;
    frames.push({ name, x: r.x, y: r.y, w: pw, h: ph, ww, wh, px: pvx, py: pvy });
    return frames.length - 1;
  }

  // soft radial blob (fx only, no mask)
  function soft(c0, c1, r, x, y) {
    const g = cb.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    cb.fillStyle = g; cb.beginPath(); cb.arc(x, y, r, 0, Math.PI * 2); cb.fill();
  }

  // ==================================================================== nature: helpers
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
    return `rgb(${r},${g},${b})`;
  }
  const ellO = (x, y, rx, ry, c, w = 0.28, rot = 0) => pen.begin().ell(x, y, rx, ry, rot).fill(c).stroke(OL, w);
  const circO = (x, y, r, c, w = 0.28) => pen.begin().arc(x, y, r).fill(c).stroke(OL, w);
  const eye = (x, y, r = 0.55) => { circ(x, y, r, '#fff'); circ(x + r * 0.25, y, r * 0.55, '#1d1820'); circ(x + r * 0.05, y - r * 0.3, r * 0.2, '#fff'); };
  const shadowE = (x, y, rx) => ell(x, y, rx, rx * 0.28, 'rgba(0,0,0,0.16)');
  // four little legs; f: 0/1 walk, 2 action, 3 lying
  function legs4(x0, x1, top, len, c, w, f) {
    if (f === 3) return;
    const s = f === 0 ? 0.9 : f === 1 ? -0.9 : 0;
    for (const [bx, k] of [[x0, -1], [x0 + 1.1, 1], [x1 - 1.1, -1], [x1, 1]]) {
      const dx = s * k;
      line(bx, top, bx + dx, top + len, k > 0 ? c : shade(c, -25), w);
    }
  }

  // ==================================================================== animals
  // each returns [w, h, groundY, draw(f)] ; facing right
  const A = {
    rabbit: [10, 9, 8, (f) => {
      shadowE(5, 8, 3.6);
      const ly = f === 3 ? 1.2 : 0, hop = f === 1 ? -0.6 : 0;
      ellO(1.6, 4.8 + ly + hop, 1.1, 1.1, '#fff');
      ellO(4.6, 5.4 + ly + hop, 3.2, 2.3, '#b48a68');
      if (f !== 3) { ellO(6.2, 7.4 + hop, 1.3, 0.6, '#9a7458'); ellO(2.8, 7.3 + hop, 1.5, 0.7, '#9a7458'); }
      const hx = f === 2 ? 7.4 : 7.2, hy = (f === 2 ? 5.6 : 3.6) + ly + hop;
      ellO(hx - 0.8, hy - 2.8, 0.7, 2.2, '#b48a68', 0.28, -0.25); ellO(hx + 0.1, hy - 2.9, 0.7, 2.3, '#c49a78', 0.28, 0.15);
      ell(hx + 0.1, hy - 2.7, 0.3, 1.5, '#f2b6b6');
      ellO(hx, hy, 1.9, 1.7, '#c49a78');
      if (f === 3) line(hx + 0.2, hy - 0.2, hx + 1, hy - 0.2, OL, 0.25); else eye(hx + 0.6, hy - 0.3, 0.5);
      circ(hx + 1.8, hy + 0.3, 0.3, '#e88');
    }],
    mouse: [7, 5, 4.4, (f) => {
      shadowE(3.5, 4.4, 2.4);
      const ly = f === 3 ? 0.5 : 0;
      pen.begin().moveTo(1.4, 3.4 + ly).quad(-0.2, 2.4, 0.2, 4.4).stroke('#c79a9a', 0.3);
      ellO(3.2, 3.1 + ly, 2, 1.3, '#9d9aa4');
      ellO(4.1, 1.6 + ly, 0.8, 0.8, '#b8b5bf');
      ellO(5.1, 2.6 + ly, 1.2, 0.9, '#9d9aa4');
      circ(6.2, 2.8 + ly, 0.25, '#e88');
      if (f !== 3) eye(5.3, 2.4 + ly, 0.35); else line(5.1, 2.5, 5.6, 2.5, OL, 0.2);
      if (f < 3) { line(2.4, 4, 2.4 + (f ? 0.4 : -0.4), 4.4, '#7d7a84', 0.4); line(4, 4, 4 + (f ? -0.4 : 0.4), 4.4, '#7d7a84', 0.4); }
    }],
    squirrel: [10, 10, 9, (f) => {
      shadowE(5, 9, 3.4);
      const ly = f === 3 ? 1 : 0;
      pen.begin().moveTo(3, 7 + ly).bez(-1, 6, -0.5, 1, 2.6, 1.6).bez(1.6, 3.4, 2.4, 5.6, 4, 6.4).close().fill('#c9692e').stroke(OL, 0.28);
      pen.begin().moveTo(2.6, 2.6).bez(1.2, 3.6, 1.6, 5.4, 3, 6.2).stroke('#e08a4a', 0.5);
      ellO(5.2, 6.6 + ly, 2.2, 1.9, '#c9692e');
      ellO(5.9, 7 + ly, 1, 1.1, '#f3dcb8');
      legs4(4.2, 6.4, 8 + ly, 0.9, '#a3501f', 0.55, f);
      const hy = (f === 2 ? 5.2 : 4.4) + ly;
      ellO(7.1, hy, 1.5, 1.4, '#d4783a');
      poly([6.4, hy - 1, 6.8, hy - 2.4, 7.3, hy - 1.1], '#c9692e', OL, 0.25);
      if (f === 3) line(7.4, hy - 0.2, 8.1, hy - 0.2, OL, 0.22); else eye(7.7, hy - 0.3, 0.45);
      if (f === 2) circO(8.7, hy + 0.9, 0.6, '#8a5a2b', 0.2);
    }],
    deer: [20, 21, 20, (f, male) => {
      shadowE(10, 20, 6.4);
      const ly = f === 3 ? 4 : 0;
      legs4(6, 13.4, 13 + ly * 0.5, 6.8 - ly, '#9a6034', 0.75, f);
      pen.begin().moveTo(5, 11).lineTo(4.2, 10).stroke('#fff', 0.8);
      ellO(9.6, 11.4 + ly, 5.4, 3, '#b8743e');
      ell(9.6, 13.2 + ly, 3.6, 1, '#ead2b0');
      const hd = f === 2;
      const nx = hd ? 15.4 : 14.2, ny = hd ? 14 + ly : 6.4 + ly;
      pen.begin().moveTo(12.4, 9.6 + ly).lineTo(nx - 0.6, ny + 0.6).lineTo(nx + 0.6, ny + 1.4).lineTo(14.2, 11.4 + ly).close().fill('#b8743e').stroke(OL, 0.28);
      ellO(nx + 1.4, ny + 0.4, 2, 1.3, '#c4824a', 0.28, 0.3);
      circ(nx + 3.1, ny + 0.9, 0.35, '#2b2433');
      poly([nx + 0.2, ny - 0.8, nx - 1.6, ny - 2.2, nx - 0.4, ny - 0.2], '#b8743e', OL, 0.25);
      if (f === 3) line(nx + 1.3, ny + 0.1, nx + 2.1, ny + 0.1, OL, 0.25); else eye(nx + 1.5, ny, 0.5);
      if (male) {
        const ax = nx + 0.6, ay = ny - 0.8;
        pen.begin().moveTo(ax, ay).lineTo(ax - 1, ay - 3).lineTo(ax - 2.6, ay - 4.6).moveTo(ax - 1, ay - 3).lineTo(ax + 0.6, ay - 4.8).moveTo(ax - 1.8, ay - 3.9).lineTo(ax - 3.2, ay - 3.4).stroke('#e6d3a8', 0.55);
      } else { circ(7, 10.4 + ly, 0.45, '#f5e6d0'); circ(9, 9.8 + ly, 0.45, '#f5e6d0'); circ(11.2, 10.2 + ly, 0.45, '#f5e6d0'); }
    }],
    boar: [16, 12, 11, (f) => {
      shadowE(8, 11, 5.6);
      const ly = f === 3 ? 2 : 0;
      legs4(4.4, 10.6, 8 + ly * 0.5, 3 - ly * 0.5, '#4a3a30', 0.8, f);
      line(2.2, 6.4 + ly, 1.4, 7.4 + ly, '#4a3a30', 0.4);
      ellO(7.6, 6.6 + ly, 5.4, 3.1, '#6b5444');
      pen.begin().moveTo(4, 4 + ly).lineTo(5, 3 + ly).lineTo(6, 3.8 + ly).lineTo(7, 2.9 + ly).lineTo(8, 3.8 + ly).lineTo(9, 3.1 + ly).lineTo(10, 3.9 + ly).stroke('#3e3028', 0.5);
      const hy = (f === 2 ? 8.6 : 6.8) + ly;
      pen.begin().moveTo(11, hy - 2.6).lineTo(15.4, hy).lineTo(14.6, hy + 1.6).lineTo(11, hy + 2).close().fill('#7b6252').stroke(OL, 0.28);
      ellO(15.2, hy + 0.7, 0.8, 1, '#c99a8a', 0.22);
      poly([13.6, hy + 1.2, 14.4, hy - 0.4, 14.2, hy + 1.4], '#fff8e8');
      poly([11.4, hy - 2.4, 11.2, hy - 4, 12.6, hy - 2.6], '#6b5444', OL, 0.22);
      if (f === 3) line(12.6, hy - 1, 13.4, hy - 1, OL, 0.25); else eye(13, hy - 1, 0.45);
    }],
    bison: [25, 19, 18, (f) => {
      shadowE(12, 18, 8);
      const ly = f === 3 ? 3 : 0;
      legs4(6.6, 16.6, 13 + ly * 0.5, 4.8 - ly, '#3b2a20', 1.1, f);
      ellO(10.4, 10.8 + ly, 7.6, 4.4, '#6a4a32');
      ellO(15.6, 8.4 + ly, 4.6, 5, '#4a3222');
      pen.begin().moveTo(3, 10 + ly).quad(1.6, 12, 2.4, 14 + ly).stroke('#3b2a20', 0.5);
      const hy = (f === 2 ? 13.6 : 10.8) + ly;
      ellO(20.4, hy, 2.6, 2.6, '#3a271b');
      pen.begin().moveTo(19.6, hy - 2.4).quad(19.8, hy - 4.4, 21.4, hy - 4).stroke('#efe3c4', 0.6);
      circ(22.4, hy + 1.4, 0.35, '#1d1820');
      ell(20.6, hy + 2.8, 1.4, 1, '#3a271b');
      if (f === 3) line(20.8, hy - 0.4, 21.8, hy - 0.4, OL, 0.25); else eye(21.4, hy - 0.6, 0.5);
    }],
    beaver: [12, 8, 7.4, (f) => {
      shadowE(6, 7.4, 4);
      const ly = f === 3 ? 0.6 : 0;
      ellO(1.8, 6 + ly, 1.8, 0.9, '#5a4a40', 0.28, 0.2);
      for (let k = 0; k < 3; k++) line(0.8 + k * 0.8, 5.6 + ly, 1.2 + k * 0.8, 6.6 + ly, '#4a3a32', 0.15);
      ellO(5.6, 4.8 + ly, 3.2, 2.4, '#8a5a34');
      const hy = (f === 2 ? 5.6 : 4) + ly;
      ellO(8.8, hy, 1.8, 1.6, '#9a6a42');
      box(9.8, hy + 0.9, 0.9, 0.9, '#fff6d0');
      circ(10.4, hy - 0.1, 0.3, '#1d1820');
      if (f === 3) line(8.8, hy - 0.5, 9.6, hy - 0.5, OL, 0.22); else eye(9.2, hy - 0.5, 0.42);
      circO(7.8, hy - 1.5, 0.45, '#8a5a34', 0.2);
      if (f === 2) { line(10.6, hy + 1.2, 11.8, hy + 0.2, '#8a5a2b', 0.6); }
    }],
    fox: [14, 10, 9, (f) => {
      shadowE(7, 9, 4.6);
      const ly = f === 3 ? 1.6 : 0;
      legs4(4.2, 9, 6.6 + ly * 0.5, 2.2 - ly * 0.5, '#3a2a22', 0.55, f);
      pen.begin().moveTo(3.4, 5.4 + ly).bez(1, 5, -0.4, 6.4, 0.6, 7.6 + ly * 0.4).bez(1.6, 7.4, 2.6, 6.8, 3.4, 6.4 + ly).close().fill('#e0702a').stroke(OL, 0.28);
      circ(0.8, 7.2 + ly * 0.4, 0.6, '#fff');
      ellO(6.6, 5.6 + ly, 3.4, 1.8, '#e0702a');
      ell(6.8, 6.6 + ly, 2.2, 0.7, '#fff4e4');
      const hy = (f === 2 ? 6.6 : 4.2) + ly;
      pen.begin().moveTo(9, hy - 1.4).lineTo(13.4, hy + 0.4).lineTo(9.4, hy + 1.6).close().fill('#e8803a').stroke(OL, 0.28);
      ell(11.6, hy + 0.8, 1.4, 0.5, '#fff4e4');
      circ(13.3, hy + 0.4, 0.3, '#1d1820');
      poly([9.2, hy - 1.2, 9.6, hy - 3.4, 10.8, hy - 1], '#e0702a', OL, 0.25);
      if (f === 3) line(10.6, hy - 0.2, 11.4, hy - 0.2, OL, 0.22); else eye(10.8, hy - 0.3, 0.45);
    }],
    wolf: [17, 13, 12, (f) => {
      shadowE(8.5, 12, 5.6);
      const ly = f === 3 ? 2.4 : 0;
      legs4(5, 11.2, 8.6 + ly * 0.5, 3.2 - ly * 0.6, '#5c5e66', 0.7, f);
      pen.begin().moveTo(3.8, 6.6 + ly).quad(1, 7.6, 0.8, 9.8 + ly * 0.3).quad(2.6, 8.6, 4.2, 7.8 + ly).close().fill('#8a8c94').stroke(OL, 0.28);
      ellO(7.8, 7 + ly, 4.6, 2.4, '#8a8c94');
      ell(8, 8.4 + ly, 3.2, 0.8, '#d8d8de');
      const howl = f === 2;
      const hy = (howl ? 3.4 : 5.2) + ly;
      pen.begin().moveTo(10.8, hy - 1.6).lineTo(howl ? 15.6 : 16, howl ? hy - 3 : hy + 0.4).lineTo(11.4, hy + 1.8).close().fill('#9a9ca4').stroke(OL, 0.28);
      circ(howl ? 15.4 : 15.8, howl ? hy - 2.8 : hy + 0.4, 0.35, '#1d1820');
      poly([11, hy - 1.4, 11.6, hy - 3.8, 12.6, hy - 1.4], '#8a8c94', OL, 0.25);
      if (f === 3) line(12.6, hy - 0.4, 13.4, hy - 0.4, OL, 0.22); else eye(12.8, hy - 0.5, 0.48);
    }],
    lynx: [15, 12, 11, (f) => {
      shadowE(7.5, 11, 5);
      const ly = f === 3 ? 2 : 0;
      legs4(4.6, 10.4, 7.6 + ly * 0.5, 3.4 - ly * 0.6, '#8a6a40', 0.8, f);
      ellO(2.6, 6.2 + ly, 0.9, 0.9, '#c9a46a');
      ellO(7.4, 6.6 + ly, 4, 2.4, '#c9a46a');
      for (const [sx, sy] of [[5.6, 6], [7.4, 5.6], [9, 6.4], [6.4, 7.4]]) circ(sx, sy + ly, 0.35, '#7a5a34');
      const hy = (f === 2 ? 7.6 : 5) + ly;
      ellO(12, hy, 2.3, 2, '#d4b07a');
      line(11, hy - 1.8, 10.8, hy - 3.8, '#2b2433', 0.4); line(12.8, hy - 1.8, 13.2, hy - 3.8, '#2b2433', 0.4);
      poly([10.6, hy - 1.4, 10.9, hy - 3.2, 11.9, hy - 1.6], '#c9a46a', OL, 0.22);
      poly([12.4, hy - 1.6, 13.1, hy - 3.2, 13.6, hy - 1.2], '#c9a46a', OL, 0.22);
      line(12.2, hy + 1.6, 11.6, hy + 2.6, '#f2e8d8', 0.6); line(13.4, hy + 1.4, 14.2, hy + 2.4, '#f2e8d8', 0.6);
      if (f === 3) line(12.4, hy - 0.2, 13.4, hy - 0.2, OL, 0.22); else eye(12.8, hy - 0.4, 0.5);
    }],
    bear: [23, 17, 16, (f) => {
      shadowE(11.5, 16, 7.6);
      const ly = f === 3 ? 3 : 0;
      if (f !== 3) for (const [bx, k] of [[6, -1], [8, 1], [14.4, -1], [16.4, 1]]) { const s = f === 0 ? 0.8 * k : f === 1 ? -0.8 * k : 0; rbox(bx - 1.3 + s, 11 + ly, 2.6, 4.6, 1.2, k > 0 ? '#6a4228' : '#5a3620'); }
      ellO(11, 9.4 + ly, 7.4, 4.8, '#7a4c2c');
      const hy = (f === 2 ? 11 : 7.6) + ly;
      ellO(18.6, hy, 3.2, 3, '#8a5a34');
      circO(17.4, hy - 2.8, 1, '#7a4c2c', 0.25);
      ellO(21, hy + 0.8, 1.6, 1.2, '#c9a07a', 0.25);
      circ(22.2, hy + 0.4, 0.4, '#1d1820');
      if (f === 3) line(19, hy - 0.6, 20, hy - 0.6, OL, 0.25); else eye(19.4, hy - 0.8, 0.55);
    }],
    eagle: [18, 11, 5.5, (f) => {
      if (f === 3) { // perched
        ellO(9, 6, 2.6, 3.4, '#5a3c26'); circO(10.4, 2.6, 1.6, '#fff'); poly([11.6, 2.4, 13.2, 3, 11.6, 3.6], '#f2b630', OL, 0.22); eye(10.8, 2.2, 0.4);
        line(8.4, 9.2, 8.4, 10.4, '#f2b630', 0.4); line(9.8, 9.2, 9.8, 10.4, '#f2b630', 0.4); return;
      }
      const up = f === 0;
      const wy = f === 2 ? 4.2 : up ? 0.6 : 8;
      pen.begin().moveTo(6.4, 5).quad(3, wy, 0.2, wy + (up ? 1.6 : -0.4)).quad(3.4, 5.6, 6.8, 6).close().fill('#5a3c26').stroke(OL, 0.28);
      pen.begin().moveTo(10.6, 5).quad(14, wy, 17.4, wy + (up ? 1.6 : -0.4)).quad(14, 5.6, 10.6, 6).close().fill('#6a4630').stroke(OL, 0.28);
      ellO(8.6, 5.4, 4, 1.6, '#5a3c26');
      poly([4.8, 5, 3, 4.2, 3, 6.6, 4.8, 6], '#fff', OL, 0.22);
      circO(13, 4.6, 1.5, '#fff');
      poly([14.2, 4.2, 15.8, 4.8, 14.2, 5.6], '#f2b630', OL, 0.22);
      eye(13.4, 4.2, 0.4);
    }],
    owl: [12, 11, 5.5, (f) => {
      if (f === 3) {
        ellO(6, 6.4, 3, 3.6, '#a8865e'); ellO(6, 3.4, 2.6, 2.2, '#b8966e');
        circ(5, 3.4, 0.9, '#fff3c8'); circ(7, 3.4, 0.9, '#fff3c8'); circ(5.2, 3.5, 0.45, '#1d1820'); circ(7.2, 3.5, 0.45, '#1d1820');
        poly([5.8, 4, 6.2, 4, 6, 4.8], '#e0a030'); poly([4.4, 1.6, 4.6, 0.4, 5.4, 1.4], '#a8865e'); poly([7.6, 1.6, 7.4, 0.4, 6.6, 1.4], '#a8865e');
        return;
      }
      const up = f === 0, wy = up ? 1 : 8.6;
      pen.begin().moveTo(5, 5.6).quad(2.6, wy, 0.2, wy + 1).quad(2.6, 6.6, 5, 6.6).close().fill('#a8865e').stroke(OL, 0.28);
      pen.begin().moveTo(7, 5.6).quad(9.4, wy, 11.8, wy + 1).quad(9.4, 6.6, 7, 6.6).close().fill('#a8865e').stroke(OL, 0.28);
      ellO(6, 6, 2.4, 2.6, '#b8966e');
      circ(5.2, 5, 0.8, '#fff3c8'); circ(6.8, 5, 0.8, '#fff3c8'); circ(5.3, 5.1, 0.4, '#1d1820'); circ(6.9, 5.1, 0.4, '#1d1820');
    }],
    vulture: [19, 11, 5.5, (f) => {
      if (f === 3) {
        ellO(9, 6.6, 3.2, 3.6, '#3e3634'); ellO(9.6, 3.4, 2, 0.8, '#e8e0d8'); circO(11.2, 2.4, 1.1, '#e8a088'); poly([12, 2.2, 13.4, 2.8, 12, 3.2], '#e8d8a8'); eye(11.4, 2.1, 0.35);
        line(8.4, 10, 8.4, 10.8, '#8a7a70', 0.4); line(9.8, 10, 9.8, 10.8, '#8a7a70', 0.4); return;
      }
      const up = f === 0, wy = f === 2 ? 4 : up ? 1.4 : 7.4;
      pen.begin().moveTo(7, 5).quad(3.6, wy, 0.2, wy + 0.6).lineTo(1, wy + 1.6).quad(4, 6, 7, 6.2).close().fill('#3e3634').stroke(OL, 0.28);
      pen.begin().moveTo(11.6, 5).quad(15, wy, 18.6, wy + 0.6).lineTo(17.8, wy + 1.6).quad(15, 6, 11.6, 6.2).close().fill('#4a4240').stroke(OL, 0.28);
      ellO(9.4, 5.6, 3.8, 1.6, '#3e3634');
      ell(12.6, 4.8, 1.2, 0.8, '#e8e0d8');
      circO(14.2, 4.4, 1, '#e8a088');
      poly([15, 4.2, 16.4, 4.8, 15, 5.2], '#e8d8a8', OL, 0.2);
      eye(14.4, 4.1, 0.33);
    }],
    crow: [10, 8, 4, (f) => {
      if (f === 3) {
        ellO(5, 4.6, 2.2, 1.8, '#2c2a34'); circO(7.2, 3.4, 1.2, '#34323c'); poly([8.2, 3.2, 9.6, 3.6, 8.2, 4], '#3a3a3a', OL, 0.2); eye(7.5, 3, 0.36);
        pen.begin().moveTo(3, 4.4).lineTo(1, 5.2).lineTo(3, 5.4).close().fill('#2c2a34');
        line(4.6, 6.2, 4.6, 7.4, '#2c2a34', 0.35); line(5.6, 6.2, 5.6, 7.4, '#2c2a34', 0.35); return;
      }
      const up = f === 0, wy = up ? 0.6 : 6.4;
      pen.begin().moveTo(4, 3.6).quad(2.4, wy, 0.4, wy + 0.6).quad(2.4, 4.2, 4.4, 4.4).close().fill('#2c2a34').stroke(OL, 0.25);
      pen.begin().moveTo(5.4, 3.6).quad(7, wy, 9, wy + 0.6).quad(7, 4.2, 5.4, 4.4).close().fill('#34323c').stroke(OL, 0.25);
      ellO(5, 4, 2.6, 1.1, '#2c2a34'); circO(7.6, 3.6, 1, '#34323c'); poly([8.4, 3.4, 9.8, 3.8, 8.4, 4.2], '#3a3a3a', OL, 0.2); eye(7.8, 3.3, 0.32);
    }],
    duck: [10, 8, 7, (f) => {
      const sw = f === 1 ? 0.2 : 0;
      ellO(4.6, 5.2 + sw, 3.6, 2, '#efe6d0');
      pen.begin().moveTo(1.4, 4.8 + sw).lineTo(0.2, 3.8 + sw).lineTo(1.8, 4.2 + sw).close().fill('#efe6d0').stroke(OL, 0.22);
      ellO(4.2, 4.4 + sw, 1.8, 1, '#a88a6a');
      const hy = f === 2 ? 6 : 2.6;
      if (f !== 2) line(7, 4.4 + sw, 7.4, hy + 0.8, '#2f7a4a', 1.1);
      circO(7.8, hy + sw, 1.4, '#2f7a4a');
      poly([8.8, hy + sw - 0.2, 10, hy + sw + 0.3, 8.8, hy + sw + 0.8], '#f2a020', OL, 0.2);
      line(6.8, hy + 1.2 + sw, 8.4, hy + 1.2 + sw, '#fff', 0.3);
      if (f === 3) line(7.8, hy - 0.3, 8.6, hy - 0.3, OL, 0.2); else eye(8.1, hy - 0.4, 0.38);
    }],
    heron: [12, 18, 17, (f) => {
      shadowE(6, 17, 2.6);
      line(5.4, 11, 5 + (f === 0 ? 0.6 : 0), 17, '#d8b070', 0.4); line(6.6, 11, 6.8 - (f === 1 ? 0.6 : 0), 17, '#c8a060', 0.4);
      pen.begin().moveTo(3, 9.6).lineTo(1, 12.6).lineTo(3.6, 11).close().fill('#9aa0aa').stroke(OL, 0.22);
      ellO(5.6, 9.4, 3, 2, '#b8bec8');
      const strike = f === 2;
      const hx = strike ? 10 : 7.6, hy = strike ? 11.6 : 3.2;
      pen.begin().moveTo(6.8, 8.4).quad(strike ? 9 : 5.6, strike ? 9.4 : 6, hx, hy).stroke('#d8dce2', 1);
      circO(hx, hy, 1.1, '#e8ecf2', 0.22);
      line(hx - 0.8, hy - 0.6, hx - 2.6, hy - 1.4, '#2b2433', 0.25);
      poly([hx + 0.8, hy - 0.2, hx + 3.6, hy + 0.3, hx + 0.8, hy + 0.6], '#f0c040', OL, 0.18);
      eye(hx + 0.3, hy - 0.2, 0.32);
    }],
    fish: [9, 5, 2.5, (f) => {
      const w = f === 1 ? 0.6 : -0.6;
      poly([1.6, 2.5, 0.2, 0.8 + w * 0.5, 0.2, 4.2 + w * 0.5], '#e8955a', OL, 0.22);
      ellO(4.8, 2.5, 3.4, 1.6, '#f0a868');
      ell(5, 3.2, 2.2, 0.6, '#fbe2c4');
      poly([4.2, 1, 5.4, 0.2, 6, 1.1], '#e8955a', OL, 0.18);
      eye(7, 2.1, 0.4);
    }],
    frog: [7, 6, 5.4, (f) => {
      shadowE(3.5, 5.4, 2.6);
      const j = f === 1 ? -1.2 : 0;
      ellO(3.4, 3.8 + j, 2.6, 1.6, '#5cae4a');
      ellO(1.6, 4.6 + j, 1.3, 0.8, '#4a9a3a');
      ellO(5.6, 4.6 + j, 0.8, 0.9, '#4a9a3a');
      circO(4.2, 2.2 + j, 0.9, '#6cbe5a', 0.22); circO(5.8, 2.4 + j, 0.9, '#6cbe5a', 0.22);
      eye(4.4, 2.1 + j, 0.5); eye(6, 2.3 + j, 0.5);
      if (f === 2) { line(6, 3.6, 6.9, 3.4, '#ff7a90', 0.4); ell(5.4, 4.6 + j, 1.2, 0.8, '#f4f0c0'); }
      else line(4.6, 3.6 + j, 6.2, 3.4 + j, '#2b2433', 0.2);
    }],
    bee: [4, 3, 1.5, (f) => {
      ell(1.4, f === 0 ? 0.6 : 1, 0.9, 0.6, 'rgba(220,240,255,0.85)'); ell(2.2, f === 0 ? 0.6 : 1, 0.9, 0.6, 'rgba(220,240,255,0.85)');
      ellO(2, 1.8, 1.4, 0.9, '#f5c518', 0.18);
      line(1.6, 1, 1.6, 2.6, '#2b2433', 0.35); line(2.4, 1, 2.4, 2.6, '#2b2433', 0.35);
    }],
    butterfly: [6, 5, 2.5, (f) => {
      const o = f === 1 ? 0.5 : 1;
      ellO(3 - 1.4 * o, 1.6, 1.4 * o, 1.4, '#ff8a3d', 0.2); ellO(3 + 1.4 * o, 1.6, 1.4 * o, 1.4, '#ff8a3d', 0.2);
      ellO(3 - 1 * o, 3.4, 1 * o, 1, '#ffd23d', 0.2); ellO(3 + 1 * o, 3.4, 1 * o, 1, '#ffd23d', 0.2);
      line(3, 1, 3, 4, '#2b2433', 0.5);
    }],
    hive: [9, 11, 10, (f) => {
      shadowE(4.5, 10, 3.6);
      line(4.5, 10, 4.5, 6, '#8a5a2b', 0.8);
      for (let k = 0; k < 4; k++) ellO(4.5, 2.4 + k * 1.7, 2.4 + (k === 0 || k === 3 ? -0.4 : 0.4), 1.1, '#e8b440', 0.25);
      ell(4.5, 7.4, 0.8, 0.6, '#3a2a1a');
    }],
    carcass: [11, 6, 4.4, (f) => {
      ellO(5.5, 3.8, 4.4, 1.6, '#c9786a', 0.25);
      for (let k = 0; k < 4; k++) pen.begin().moveTo(3 + k * 1.4, 3.2).quad(3.4 + k * 1.4, 1.2, 4 + k * 1.4, 2.8).stroke('#f6efe0', 0.45);
      circO(9.4, 3.6, 1.1, '#f6efe0', 0.22);
    }],
    unicorn: [20, 21, 20, (f) => {
      shadowE(10, 20, 6.4);
      legs4(6, 13.4, 13, 6.8, '#e8e4f4', 0.85, f === 3 ? 0 : f);
      ellO(9.6, 11.4, 5.4, 3, '#fbf8ff');
      pen.begin().moveTo(4.4, 10).quad(1.6, 11, 2, 15).stroke('#ff9ad8', 0.9); pen.begin().moveTo(4.4, 10.6).quad(2.4, 12, 2.8, 15.6).stroke('#9ad8ff', 0.7);
      const nx = 14.2, ny = 6.4;
      pen.begin().moveTo(12.4, 9.6).lineTo(nx - 0.6, ny + 0.6).lineTo(nx + 0.6, ny + 1.4).lineTo(14.2, 11.4).close().fill('#fbf8ff').stroke(OL, 0.28);
      pen.begin().moveTo(12.6, 9).quad(12, 6.6, 13.6, 5.4).stroke('#c89aff', 0.9);
      ellO(nx + 1.4, ny + 0.4, 2, 1.3, '#fbf8ff', 0.28, 0.3);
      poly([nx + 0.8, ny - 1, nx + 2.6, ny - 5.6, nx + 1.6, ny - 0.8], '#ffd84a', OL, 0.22);
      eye(nx + 1.5, ny, 0.5);
    }],
    nessie: [28, 20, 18, (f) => {
      const b = f === 1 ? 0.6 : 0;
      ellO(9, 16 + b, 6, 2.4, '#3f8a72');
      ellO(16, 16.4 - b, 3, 1.6, '#3f8a72');
      pen.begin().moveTo(6, 15).quad(2, 13, 1, 15.6).stroke('#3f8a72', 1.4);
      pen.begin().moveTo(10, 14.8).bez(13, 10, 19, 13, 21, 4).stroke('#4a9a80', 2.6);
      ellO(22.2, 4, 2.6, 1.8, '#4a9a80');
      eye(22.8, 3.4, 0.6);
      line(23.4, 5, 24.6, 4.8, '#2b2433', 0.25);
      ell(14, 18, 12, 1, 'rgba(255,255,255,0.6)');
    }],
    bigfoot: [13, 23, 22, (f) => {
      shadowE(6.5, 22, 4.4);
      const s = f === 0 ? 1.4 : f === 1 ? -1.4 : 0;
      rbox(3.6 + s, 15, 2.6, 7, 1.2, '#5a3c28'); rbox(6.8 - s, 15, 2.6, 7, 1.2, '#6a4a32');
      ellO(6.4, 11, 4, 5.4, '#6a4a32');
      line(3, 8, 2.4 - s, 15, '#5a3c28', 1.6); line(9.6, 8, 10.4 + s, 15, '#6a4a32', 1.6);
      ellO(7, 4, 2.8, 3, '#6a4a32');
      ell(8, 4.6, 1.6, 1.6, '#b08868');
      eye(8.4, 4.2, 0.45);
    }],
    dodo: [10, 10, 9.4, (f) => {
      shadowE(5, 9.4, 3.4);
      line(4.4, 7.6, 4.2 + (f === 0 ? 0.5 : 0), 9.4, '#f2c040', 0.5); line(5.6, 7.6, 5.8 - (f === 1 ? 0.5 : 0), 9.4, '#f2c040', 0.5);
      ellO(4.8, 5.8, 3.6, 2.8, '#8a8e9a');
      poly([1.4, 5, 0.4, 3.6, 2, 4.4], '#f4f0e8', OL, 0.2);
      const hy = f === 2 ? 5 : 2.8;
      circO(7.4, hy, 1.6, '#9a9eaa');
      pen.begin().moveTo(8.4, hy - 0.6).quad(11, hy, 10, hy + 1.8).lineTo(8.4, hy + 1).close().fill('#d8c070').stroke(OL, 0.2);
      eye(7.8, hy - 0.4, 0.45);
    }],
  };

  // ==================================================================== plants
  const TREE_COL = { s: ['#5aa04a', '#4a923e', '#68ae54'], a: ['#e08a2a', '#d4602a', '#e8b030'] };
  function tree(c, snow) {
    return () => {
      shadowE(6, 15, 4.4);
      rbox(5.2, 9.6, 1.6, 5.4, 0.5, '#7a5230');
      circO(6, 7, 4.4, c); circO(3.6, 8.8, 2.8, shade(c, -10)); circO(8.6, 8.6, 3, shade(c, -16));
      circ(5, 5.4, 2.2, shade(c, 18)); circ(7.6, 5, 1.2, shade(c, 34));
      if (snow) { pen.begin().arc(6, 6.6, 4.3, Math.PI * 1.08, Math.PI * 1.92).lineTo(8, 4.6).lineTo(4, 4.6).close().fill('#fbfcff'); }
    };
  }

  // ==================================================================== build atlas
  G.buildAtlas = function () {
    PAD = 3;
    const UN = G.UNITS;
    G.unitFrames = new Int32Array(UN.length * 4);
    G.unitFramesM = new Int32Array(UN.length * 4);
    for (const u of UN) {
      const def = A[u.k];
      const [w, h, g, fn] = def;
      const small = w < 8;
      for (let f = 0; f < 4; f++) {
        const fi = frame('a_' + u.k + f, w, h, 0.5, g / h, () => fn(f, false), false, small ? 'thin' : true);
        G.unitFrames[u.id * 4 + f] = fi;
        G.unitFramesM[u.id * 4 + f] = fi;
      }
      if (u.flags & G.F.DIMORPH) for (let f = 0; f < 4; f++) G.unitFramesM[u.id * 4 + f] = frame('m_' + u.k + f, w, h, 0.5, g / h, () => fn(f, true), false, true);
    }

    // ------------------------------------------------ plants & terrain objects
    for (let v = 0; v < 3; v++) frame('tree' + v, 12, 16, 0.5, 15 / 16, tree(TREE_COL.s[v]), false, true);
    for (let v = 0; v < 2; v++) frame('treeA' + v, 12, 16, 0.5, 15 / 16, tree(TREE_COL.a[v]), false, true);
    frame('treeW', 12, 16, 0.5, 15 / 16, () => {
      shadowE(6, 15, 3.6);
      line(6, 15, 6, 6, '#6a4a30', 1.2); line(6, 10, 3.2, 6.6, '#6a4a30', 0.7); line(6, 8.6, 8.8, 5.4, '#6a4a30', 0.7); line(6, 7, 5, 4, '#6a4a30', 0.5);
      line(3.2, 6.4, 4.4, 6.4, '#fbfcff', 0.5); line(8, 5.2, 9.2, 5.2, '#fbfcff', 0.5);
    }, false, true);
    frame('pine', 11, 17, 0.5, 16 / 17, () => {
      shadowE(5.5, 16, 3.6);
      box(4.8, 12.5, 1.4, 3.6, '#6a4228');
      pen.begin().moveTo(0.6, 13).lineTo(5.5, 5.5).lineTo(10.4, 13).close().fill('#2f7a44').stroke(OL, 0.28);
      pen.begin().moveTo(1.6, 9.6).lineTo(5.5, 2.6).lineTo(9.4, 9.6).close().fill('#3a8a4e').stroke(OL, 0.28);
      pen.begin().moveTo(2.8, 6.4).lineTo(5.5, 0.4).lineTo(8.2, 6.4).close().fill('#4a9a5a').stroke(OL, 0.28);
    }, false, true);
    frame('pineW', 11, 17, 0.5, 16 / 17, () => {
      shadowE(5.5, 16, 3.6);
      box(4.8, 12.5, 1.4, 3.6, '#6a4228');
      pen.begin().moveTo(0.6, 13).lineTo(5.5, 5.5).lineTo(10.4, 13).close().fill('#2f6a44').stroke(OL, 0.28);
      pen.begin().moveTo(1.6, 9.6).lineTo(5.5, 2.6).lineTo(9.4, 9.6).close().fill('#3a7a4e').stroke(OL, 0.28);
      pen.begin().moveTo(2.8, 6.4).lineTo(5.5, 0.4).lineTo(8.2, 6.4).close().fill('#fbfcff').stroke(OL, 0.28);
      line(2, 9.4, 4, 8, '#fbfcff', 0.6); line(7, 8, 9, 9.4, '#fbfcff', 0.6);
    }, false, true);
    frame('sapling', 6, 8, 0.5, 7.5 / 8, () => { line(3, 7.5, 3, 3.6, '#7a5230', 0.5); circO(3, 3, 1.8, '#68ae54'); circO(1.8, 4.4, 1.1, '#5aa04a'); }, false, 'thin');
    frame('stump', 6, 4, 0.5, 3.4 / 4, () => { pen.begin().rrect(1.4, 1, 3.2, 2.4, 0.6).fill('#8a5a34').stroke(OL, 0.25); ell(3, 1.1, 1.6, 0.6, '#e8c890'); }, false, 'thin');
    frame('treeburnt', 12, 16, 0.5, 15 / 16, () => {
      line(6, 15, 6, 6, '#3a3430', 1.3); line(6, 10, 3.4, 6.6, '#3a3430', 0.7); line(6, 8.5, 8.8, 5.6, '#3a3430', 0.7);
    }, false, true);
    frame('bush', 8, 7, 0.5, 6.4 / 7, () => { circO(4, 4, 2.8, '#4a9a40'); circO(2, 5, 1.8, '#3e8a36'); circO(6, 5, 1.8, '#3e8a36'); }, false, 'thin');
    frame('bushB', 8, 7, 0.5, 6.4 / 7, () => {
      circO(4, 4, 2.8, '#4a9a40'); circO(2, 5, 1.8, '#3e8a36'); circO(6, 5, 1.8, '#3e8a36');
      for (const [bx, by] of [[3, 3], [5, 3.6], [2, 5], [6.2, 5.2], [4, 5.4], [4.4, 2]]) circ(bx, by, 0.55, '#c8284a');
    }, false, 'thin');
    frame('bushW', 8, 7, 0.5, 6.4 / 7, () => { for (let k = 0; k < 5; k++) line(4, 6.4, 1 + k * 1.5, 2.6 + (k % 2), '#7a5a3e', 0.35); ell(4, 3, 2.4, 0.6, '#fbfcff'); }, false, 'thin');
    const FC = ['#ff6a8a', '#ffd23d', '#ffffff', '#b07aff', '#ff9a3d'];
    for (let v = 0; v < 5; v++) frame('flower' + v, 4, 5, 0.5, 4.6 / 5, () => {
      line(2, 4.6, 2, 2.2, '#4a9a40', 0.35); ell(1.2, 3.6, 0.6, 0.3, '#5aaa4a');
      for (let k = 0; k < 5; k++) { const a = k * 1.2566; circ(2 + Math.cos(a) * 0.75, 1.6 + Math.sin(a) * 0.75, 0.6, FC[v]); }
      circ(2, 1.6, 0.45, v === 1 ? '#e08a20' : '#f5c518');
    }, false, false);
    frame('tuft', 5, 5, 0.5, 4.6 / 5, () => { for (let k = 0; k < 5; k++) line(2.5, 4.6, 0.6 + k * 0.95, 1 + (k % 2) * 1.2, k % 2 ? '#6aae3a' : '#7aba44', 0.4); }, false, false);
    frame('tuftD', 5, 5, 0.5, 4.6 / 5, () => { for (let k = 0; k < 5; k++) line(2.5, 4.6, 0.6 + k * 0.95, 1 + (k % 2) * 1.2, '#c8b878', 0.4); }, false, false);
    frame('reed', 5, 9, 0.5, 8.6 / 9, () => {
      for (let k = 0; k < 3; k++) { line(1.4 + k * 1.1, 8.6, 1 + k * 1.3, 2 + k, '#5a9a4a', 0.35); }
      rbox(0.6, 1.4, 0.8, 2, 0.4, '#8a5a34'); rbox(3, 2.6, 0.8, 2, 0.4, '#8a5a34');
    }, false, false);
    for (let v = 0; v < 2; v++) frame('rock' + v, 10, 9, 0.5, 6.5 / 9, () => {
      ell(5, 7.6, 4.6, 1.2, 'rgba(0,0,0,0.16)');
      if (v === 0) { poly([0.6, 7.6, 1.6, 3.2, 4.6, 1.4, 8.4, 2.6, 9.6, 7.4], '#9a968e'); poly([1.6, 3.2, 4.6, 1.4, 8.4, 2.6, 5, 4.4], '#bcb8b0'); }
      else { poly([0.8, 7.6, 2.4, 2.4, 6.4, 1.2, 9.2, 4.6, 9, 7.6], '#908c84'); poly([2.4, 2.4, 6.4, 1.2, 9.2, 4.6, 5.4, 4], '#b4b0a8'); }
    }, false, true);
    frame('lily', 5, 3, 0.5, 0.5, () => { pen.begin().ell(2.5, 1.5, 2, 1).fill('#5aa04a'); circ(2.6, 1.2, 0.5, '#ffb0c8'); }, false, false);

    PAD = 0;
    // ------------------------------------------------ fx
    frame('flame', 8, 8, 0.5, 0.5, () => { soft('rgba(255,240,170,1)', 'rgba(255,90,10,0)', 4, 4, 4); }, false);
    frame('smoke', 10, 10, 0.5, 0.5, () => { const g = cb.createRadialGradient(5, 5, 0, 5, 5, 4.8); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); cb.fillStyle = g; cb.beginPath(); cb.arc(5, 5, 4.8, 0, 7); cb.fill(); }, false);
    frame('spark', 2, 2, 0.5, 0.5, () => { soft('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 1, 1, 1); }, false);
    frame('dot', 2, 2, 0.5, 0.5, () => { circ(1, 1, 0.8, '#fff'); }, false);
    frame('chip', 2, 2, 0.5, 0.5, () => { poly([0.2, 1.6, 0.6, 0.3, 1.8, 0.6, 1.6, 1.8], '#fff'); }, false);
    frame('heal', 4, 4, 0.5, 0.5, () => { box(1.4, 0.3, 1.2, 3.4, '#6dff7a'); box(0.3, 1.4, 3.4, 1.2, '#6dff7a'); }, false);
    frame('flash', 16, 16, 0.5, 0.5, () => { soft('rgba(255,255,240,1)', 'rgba(255,200,90,0)', 8, 8, 8); }, false);
    frame('ring', 16, 16, 0.5, 0.5, () => { cb.strokeStyle = 'rgba(255,255,255,0.95)'; cb.lineWidth = 0.55; cb.beginPath(); cb.arc(8, 8, 7, 0, Math.PI * 2); cb.stroke(); }, false);
    frame('white', 1, 1, 0, 0, () => { cb.fillStyle = '#fff'; cb.fillRect(-1, -1, 3, 3); }, false);
    frame('shadow', 8, 3, 0.5, 0.5, () => { cb.fillStyle = 'rgba(0,0,0,0.3)'; cb.beginPath(); cb.ellipse(4, 1.5, 3.8, 1.3, 0, 0, 7); cb.fill(); }, false);
    frame('heart', 4, 4, 0.5, 0.5, () => { pen.begin().moveTo(2, 3.6).bez(-0.6, 2, 0.6, -0.2, 2, 1.2).bez(3.4, -0.2, 4.6, 2, 2, 3.6).fill('#ff5a7a'); }, false);
    frame('zzz', 4, 4, 0.5, 0.5, () => { cb.fillStyle = '#5a5a8a'; cb.font = 'bold 3.6px sans-serif'; cb.fillText('z', 0.6, 3.4); }, false);
    frame('note', 4, 5, 0.5, 0.5, () => { line(2.8, 0.6, 2.8, 3.6, '#2b2433', 0.4); ell(2.1, 3.8, 0.9, 0.7, '#2b2433'); line(2.8, 0.6, 3.8, 1.4, '#2b2433', 0.4); }, false);
    frame('cheese', 3, 2.4, 0.5, 0.5, () => { poly([0.2, 2, 2.8, 2, 2.8, 0.4], '#ffd23d', OL, 0.2); circ(2, 1.5, 0.25, '#e0a020'); }, false);
    frame('drop', 2, 8, 0.5, 0.5, () => { const g = cb.createLinearGradient(0, 0, 0, 8); g.addColorStop(0, 'rgba(120,160,220,0)'); g.addColorStop(1, 'rgba(120,160,220,0.9)'); cb.fillStyle = g; cb.fillRect(0.7, 0, 0.6, 8); }, false);
    frame('star', 4, 4, 0.5, 0.5, () => { poly([2, 0, 2.5, 1.5, 4, 2, 2.5, 2.5, 2, 4, 1.5, 2.5, 0, 2, 1.5, 1.5], '#fff6b0'); }, false);
    frame('glow', 6, 6, 0.5, 0.5, () => { soft('rgba(230,255,140,1)', 'rgba(180,255,80,0)', 3, 3, 3); }, false);
    frame('scorch', 16, 16, 0.5, 0.5, () => { soft('rgba(110,92,74,0.3)', 'rgba(110,92,74,0)', 8, 8, 8); }, false);

    G.frames = frames; G.FR = FR;
    G.atlasBase = base; G.atlasMask = mask;
    G.ATLAS_W = AW; G.ATLAS_H = AH;
  };

  // Produce a small icon (data URL) for a frame, tinted with a team colour.
  G.frameIcon = function (fi, size, rgb, bg) {
    const f = frames[fi];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); }
    const t1 = document.createElement('canvas');
    t1.width = f.w; t1.height = f.h;
    const x1 = t1.getContext('2d');
    x1.drawImage(base, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    const bd = x1.getImageData(0, 0, f.w, f.h);
    const t2 = document.createElement('canvas');
    t2.width = f.w; t2.height = f.h;
    const x2 = t2.getContext('2d');
    x2.drawImage(mask, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    const md = x2.getImageData(0, 0, f.w, f.h).data;
    const d = bd.data;
    for (let i = 0; i < d.length; i += 4) {
      const m = md[i] / 255 * (md[i + 3] / 255);
      if (m > 0) {
        const l = d[i] / 127.5;
        d[i] = d[i] * (1 - m) + Math.min(255, rgb[0] * l) * m;
        d[i + 1] = d[i + 1] * (1 - m) + Math.min(255, rgb[1] * l) * m;
        d[i + 2] = d[i + 2] * (1 - m) + Math.min(255, rgb[2] * l) * m;
      }
    }
    x1.putImageData(bd, 0, 0);
    // crop to visible content
    let bx0 = f.w, by0 = f.h, bx1 = 0, by1 = 0;
    for (let yy = 0; yy < f.h; yy++) for (let xx = 0; xx < f.w; xx++) if (d[(yy * f.w + xx) * 4 + 3] > 100) { if (xx < bx0) bx0 = xx; if (xx > bx1) bx1 = xx; if (yy < by0) by0 = yy; if (yy > by1) by1 = yy; }
    if (bx1 < bx0) { bx0 = 0; by0 = 0; bx1 = f.w - 1; by1 = f.h - 1; }
    const cw = bx1 - bx0 + 1, ch = by1 - by0 + 1;
    const s2 = Math.min(size / cw, size / ch) * 0.92;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(t1, bx0, by0, cw, ch, (size - cw * s2) / 2, (size - ch * s2) / 2, cw * s2, ch * s2);
    return c.toDataURL();
  };
})();
