'use strict';
// ============================================================================
//  Procedural sprite atlas.
//  Every sprite is drawn twice: in the BASE atlas (team parts drawn in grey,
//  the shader multiplies them by the team colour) and in the MASK atlas
//  (white = team coloured, black = keep base colour).
// ============================================================================
(function () {
  const S = 2.5; // atlas pixels per world unit
  const AW = 2048, AH = 2048;
  const base = document.createElement('canvas');
  const mask = document.createElement('canvas');
  base.width = mask.width = AW;
  base.height = mask.height = AH;
  const cb = base.getContext('2d');
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
  function outlinePass(r, pw, ph, t) {
    pw = Math.ceil(pw); ph = Math.ceil(ph);
    const img = cb.getImageData(r.x, r.y, pw, ph);
    const d = img.data;
    tmpC.width = pw; tmpC.height = ph;
    const sil = tmpX.createImageData(pw, ph), o = sil.data;
    for (let k = 0; k < d.length; k += 4) if (d[k + 3] > 140) { o[k] = 43; o[k + 1] = 36; o[k + 2] = 51; o[k + 3] = 255; }
    tmpX.putImageData(sil, 0, 0);
    for (const c of [cb, cm]) {
      c.save();
      c.beginPath(); c.rect(r.x, r.y, pw, ph); c.clip();
      c.globalCompositeOperation = 'destination-over';
      if (c === cm) { tmpX.globalCompositeOperation = 'source-in'; tmpX.fillStyle = '#000'; tmpX.fillRect(0, 0, pw, ph); tmpX.globalCompositeOperation = 'source-over'; }
      for (let a = 0; a < 12; a++) {
        const an = (a / 12) * Math.PI * 2;
        c.drawImage(tmpC, r.x + Math.cos(an) * t, r.y + Math.sin(an) * t);
      }
      c.restore();
    }
  }
  function frame(name, ww, wh, pvx, pvy, draw, team = true, ol = team) {
    const pw = ww * S, ph = wh * S;
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
    if (ol) outlinePass(r, pw, ph, ol === 'thin' ? 1.4 : 2.1);
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

  // ==================================================================== humans
  const SKIN = '#f1c39a';
  const METAL = '#a9b2ba', METAL_D = '#6d757c', WOOD = '#8a5a2b', WOOD_D = '#5e3b1b', DARK = '#2b2622';

  function drawWeapon(L, f, hx, hy) {
    const atk = f === 2;
    switch (L.weapon) {
      case 'sword':
        if (atk) { line(hx, hy, hx + 6.5, hy - 1.2, '#e8edf2', 0.9); line(hx - 0.4, hy - 1.1, hx + 0.4, hy + 1.1, '#c9a43a', 0.7); }
        else { line(hx, hy, hx + 2.4, hy - 5.6, '#e8edf2', 0.9); line(hx - 1, hy - 0.6, hx + 1, hy + 0.4, '#c9a43a', 0.7); }
        break;
      case 'bigsword':
        if (atk) { line(hx, hy, hx + 9, hy - 0.5, '#eef2f6', 1.3); line(hx - 0.2, hy - 1.6, hx + 0.2, hy + 1.6, '#e0b84a', 0.9); }
        else { line(hx, hy, hx + 3.5, hy - 8, '#eef2f6', 1.3); line(hx - 1.4, hy - 0.6, hx + 1.4, hy + 0.6, '#e0b84a', 0.9); }
        break;
      case 'katana':
        if (atk) { pen.begin().moveTo(hx, hy).quad(hx + 4, hy - 2.6, hx + 7.5, hy - 1.8).stroke('#f2f4f6', 0.7); }
        else { pen.begin().moveTo(hx, hy).quad(hx + 0.5, hy - 3.5, hx + 2.5, hy - 6.5).stroke('#f2f4f6', 0.7); }
        line(hx - 0.6, hy + 0.9, hx, hy, '#222', 0.8);
        break;
      case 'spear':
        if (atk) { line(hx - 7, hy + 0.4, hx + 8, hy - 0.3, WOOD, 0.7); poly([hx + 8, hy - 1, hx + 10.6, hy - 0.4, hx + 8, hy + 0.4], '#dfe5ea'); }
        else { line(hx - 0.8, hy + 5, hx + 1.6, hy - 9, WOOD, 0.7); poly([hx + 1.2, hy - 9, hx + 2.1, hy - 11.6, hx + 2.1, hy - 8.8], '#dfe5ea'); }
        break;
      case 'lance':
        if (atk) { line(hx - 5, hy + 0.5, hx + 11, hy, WOOD, 0.9); poly([hx + 11, hy - 0.8, hx + 14, hy, hx + 11, hy + 0.8], '#dfe5ea'); }
        else { line(hx - 3, hy + 3, hx + 6, hy - 8, WOOD, 0.9); poly([hx + 5.6, hy - 8.4, hx + 7.6, hy - 10.8, hx + 6.6, hy - 7.6], '#dfe5ea'); box(hx + 3.2, hy - 6.5, 1.8, 1.2, 1); }
        break;
      case 'fork':
        if (atk) { line(hx - 5, hy, hx + 6, hy - 0.5, WOOD, 0.6); line(hx + 6, hy - 1.4, hx + 6, hy + 0.4, '#999', 0.4); line(hx + 6, hy - 1.4, hx + 8.5, hy - 1.5, '#999', 0.35); line(hx + 6, hy - 0.5, hx + 8.5, hy - 0.5, '#999', 0.35); line(hx + 6, hy + 0.4, hx + 8.5, hy + 0.4, '#999', 0.35); }
        else { line(hx - 0.6, hy + 4.5, hx + 1.2, hy - 7, WOOD, 0.6); line(hx + 0.3, hy - 7, hx + 2.2, hy - 7, '#999', 0.4); line(hx + 0.4, hy - 7, hx + 0.5, hy - 9, '#999', 0.35); line(hx + 1.2, hy - 7, hx + 1.4, hy - 9, '#999', 0.35); line(hx + 2.1, hy - 7, hx + 2.3, hy - 9, '#999', 0.35); }
        break;
      case 'axe':
        if (atk) { line(hx - 1, hy - 1, hx + 6.5, hy + 1.5, WOOD, 0.8); poly([hx + 5, hy + 0.2, hx + 8.5, hy - 1.6, hx + 8.8, hy + 3.6, hx + 5.6, hy + 2.8], '#c8d0d6', DARK, 0.25); }
        else { line(hx - 0.5, hy + 2, hx + 2.5, hy - 7, WOOD, 0.8); poly([hx + 1.6, hy - 6.8, hx + 5.2, hy - 8.6, hx + 5.3, hy - 4.2, hx + 2.4, hy - 4.8], '#c8d0d6', DARK, 0.25); }
        break;
      case 'axes':
        if (atk) { line(hx, hy, hx + 4, hy - 2, WOOD, 0.6); poly([hx + 3, hy - 2.8, hx + 5.4, hy - 3.8, hx + 5, hy - 1], '#c8d0d6'); }
        else { line(hx, hy, hx + 1.5, hy - 4, WOOD, 0.6); poly([hx + 0.8, hy - 4, hx + 3.4, hy - 5, hx + 2.8, hy - 2.6], '#c8d0d6'); }
        break;
      case 'bow':
        if (atk) {
          pen.begin().moveTo(hx + 1.2, hy - 4.5).quad(hx + 3.6, hy, hx + 1.2, hy + 4.5).stroke(WOOD, 0.6);
          line(hx + 1.2, hy - 4.5, hx - 2.4, hy, '#eee', 0.2); line(hx - 2.4, hy, hx + 1.2, hy + 4.5, '#eee', 0.2);
          line(hx - 2.4, hy, hx + 3.4, hy, '#d8c6a0', 0.35);
        } else {
          pen.begin().moveTo(hx + 0.3, hy - 4.5).quad(hx + 2.6, hy, hx + 0.3, hy + 4.5).stroke(WOOD, 0.6);
          line(hx + 0.3, hy - 4.5, hx + 0.3, hy + 4.5, '#eee', 0.2);
        }
        break;
      case 'xbow':
        line(hx - 2.5, hy, hx + 4, hy - (atk ? 0 : 0.8), WOOD_D, 0.9);
        line(hx + 3, hy - 2.8, hx + 3.2, hy + 2.2, '#5a5f66', 0.6);
        if (atk) line(hx + 3, hy - 0.2, hx + 6, hy - 0.2, '#ddd', 0.3);
        break;
      case 'musket':
      case 'rifle':
        if (atk) { line(hx - 3, hy + 0.6, hx + 8, hy - 0.4, WOOD_D, 0.8); line(hx + 1, hy, hx + 9, hy - 0.5, '#3b3f44', 0.55); }
        else { line(hx - 1.5, hy + 3, hx + 3, hy - 7, WOOD_D, 0.8); line(hx + 0.5, hy, hx + 3.4, hy - 7.6, '#3b3f44', 0.55); }
        if (L.weapon === 'rifle') { if (atk) box(hx + 1, hy - 1.6, 3, 0.9, '#222'); else box(hx + 0.6, hy - 4, 0.9, 2.4, '#222'); }
        break;
      case 'grenade':
        if (atk) { circ(hx + 0.5, hy - 1, 1.1, '#2c2c2c'); line(hx + 0.5, hy - 2, hx + 0.9, hy - 2.8, '#c9a43a', 0.3); }
        else circ(hx + 0.4, hy + 0.2, 1.0, '#2c2c2c');
        break;
      case 'flamer':
        line(hx - 2, hy + 0.6, hx + 5.5, hy - (atk ? 0 : 1.2), '#3c3f36', 1.0);
        box(hx + 5, hy - (atk ? 0.6 : 1.8), 1.2, 1.2, '#c96b23');
        break;
      case 'staff':
        if (atk) { line(hx - 3, hy + 2, hx + 6, hy - 2.6, WOOD, 0.7); circ(hx + 6.3, hy - 2.8, 1.5, '#ff9b3d'); circ(hx + 6.3, hy - 2.8, 0.7, '#fff2c0'); }
        else { line(hx, hy + 5, hx + 1, hy - 7, WOOD, 0.7); circ(hx + 1.1, hy - 7.6, 1.4, '#ff9b3d'); circ(hx + 1.1, hy - 7.6, 0.6, '#fff2c0'); }
        break;
      case 'book':
        if (atk) { circ(hx + 2.2, hy - 3.6, 1.6, 'rgba(140,255,150,0.65)'); circ(hx + 2.2, hy - 3.6, 0.8, '#eaffea'); }
        rbox(hx - 0.6, hy - 1, 2.4, 2.6, 0.3, '#6b3c22'); box(hx - 0.3, hy - 0.8, 1.8, 2.2, '#efe6cc');
        break;
      case 'drum':
        break; // drawn on torso
      case 'bomb':
        break; // carried overhead
      case 'javelin':
        if (atk) { line(hx - 4, hy - 0.6, hx + 8, hy - 2, WOOD, 0.5); poly([hx + 8, hy - 2.6, hx + 9.8, hy - 2.2, hx + 8.1, hy - 1.5], '#dfe5ea'); }
        else { line(hx - 3, hy - 4, hx + 6, hy - 6.6, WOOD, 0.5); poly([hx + 6, hy - 7.2, hx + 7.8, hy - 7, hx + 6.2, hy - 6.1], '#dfe5ea'); }
        break;
    }
  }

  function drawHeadCore(L) {
    const skin = L.skin || SKIN;
    const hx = 8, hy = 4.6;
    // helmets drawn behind head
    if (L.helmet === 'hood' || L.helmet === 'monk' || L.helmet === 'ghillie') {
      const c = L.helmet === 'monk' ? '#7a5636' : L.helmet === 'ghillie' ? '#4e6b2c' : 0.85;
      pen.begin().arc(hx - 0.2, hy - 0.1, 2.75).fill(c);
      poly([hx - 2.6, hy, hx - 3.6, hy + 3, hx - 0.8, hy + 2.2], c);
    }
    if (L.cape) { /* drawn with torso */ }
    pen.begin().arc(hx, hy, 2.1).fill(skin).stroke(OL, 0.2);
    // big cartoon eyes
    if (L.helmet !== 'ninja') {
      pen.begin().ell(hx + 0.55, hy - 0.15, 0.5, 0.64).fill('#fff').stroke(OL, 0.13);
      pen.begin().ell(hx + 1.55, hy - 0.15, 0.5, 0.64).fill('#fff').stroke(OL, 0.13);
      circ(hx + 0.72, hy - 0.05, 0.27, '#1d1820'); circ(hx + 1.72, hy - 0.05, 0.27, '#1d1820');
      circ(hx + 0.62, hy - 0.2, 0.08, '#fff'); circ(hx + 1.62, hy - 0.2, 0.08, '#fff');
    }
    if (L.beard) { pen.begin().moveTo(hx - 0.4, hy + 0.8).quad(hx + 0.8, hy + 3.4, hx + 2.1, hy + 0.6).close().fill(L.beard); }
    switch (L.helmet) {
      case 'kettle':
        pen.begin().arc(hx, hy - 0.5, 2.25, Math.PI, 0).fill(METAL);
        line(hx - 3.2, hy - 0.5, hx + 3.2, hy - 0.5, METAL_D, 0.6);
        break;
      case 'great':
        rbox(hx - 2.3, hy - 2.6, 4.6, 5, 1.6, METAL);
        line(hx + 0.2, hy - 0.4, hx + 2.3, hy - 0.4, '#222', 0.45);
        line(hx + 1.4, hy - 2.4, hx + 1.4, hy + 2.3, METAL_D, 0.25);
        if (L.plume) pen.begin().moveTo(hx - 0.5, hy - 2.6).quad(hx - 3.5, hy - 5, hx - 4.8, hy - 1.2).quad(hx - 3, hy - 3, hx + 0.5, hy - 2.4).fill(1.05);
        break;
      case 'hood':
        pen.begin().arc(hx - 0.2, hy - 0.4, 2.4, Math.PI * 0.95, Math.PI * 1.95).fill(0.85);
        break;
      case 'monk':
        pen.begin().arc(hx - 0.2, hy - 0.4, 2.4, Math.PI * 0.95, Math.PI * 1.95).fill('#7a5636');
        break;
      case 'ghillie':
        pen.begin().arc(hx - 0.2, hy - 0.4, 2.5, Math.PI * 0.9, Math.PI * 1.95).fill('#4e6b2c');
        circ(hx - 1.6, hy - 2, 0.7, '#6a8a36'); circ(hx + 0.4, hy - 2.6, 0.6, '#3b5420');
        break;
      case 'cap':
        pen.begin().arc(hx, hy - 0.6, 2.2, Math.PI, 0).fill(0.9);
        line(hx + 1, hy - 0.7, hx + 3.4, hy - 0.4, 0.6, 0.6);
        break;
      case 'straw':
        ell(hx, hy - 1.3, 3.8, 0.8, '#e7c766');
        pen.begin().arc(hx, hy - 1.4, 1.8, Math.PI, 0).fill('#d9b44e');
        break;
      case 'tricorn':
        poly([hx - 3.4, hy - 1.2, hx, hy - 3.8, hx + 3.4, hy - 1.2, hx, hy - 1.8], '#1f1f24');
        circ(hx - 1.6, hy - 2.6, 0.5, 1.1);
        break;
      case 'bearskin':
        rbox(hx - 2.2, hy - 6.4, 4.2, 5.6, 1.6, '#1b1b1d');
        box(hx - 2.2, hy - 1.3, 4.2, 0.6, '#c9a43a');
        break;
      case 'shako':
        poly([hx - 2.1, hy - 1, hx - 1.7, hy - 5, hx + 1.9, hy - 5, hx + 2.2, hy - 1], 0.85);
        box(hx - 2.1, hy - 1.6, 4.3, 0.6, '#1b1b1d'); circ(hx + 0.1, hy - 4, 0.6, '#e6c34c');
        break;
      case 'gasmask':
        pen.begin().arc(hx, hy - 0.4, 2.3, Math.PI, 0).fill('#4a4f3c');
        circ(hx + 1.4, hy + 0.2, 1.0, '#2b2e24'); circ(hx + 1.4, hy - 0.5, 0.45, '#9ad1d8');
        break;
      case 'wizard':
        ell(hx, hy - 1.4, 3.4, 0.8, 0.8);
        poly([hx - 2, hy - 1.4, hx - 1.2, hy - 7.8, hx + 2.1, hy - 1.4], 0.95);
        circ(hx - 0.6, hy - 4, 0.4, '#ffe680');
        break;
      case 'ninja':
        pen.begin().arc(hx, hy, 2.2).fill('#2a2a33').stroke(OL, 0.2);
        rbox(hx - 0.1, hy - 0.85, 2.3, 1.1, 0.4, SKIN);
        circ(hx + 0.75, hy - 0.3, 0.26, '#111'); circ(hx + 1.6, hy - 0.3, 0.26, '#111');
        line(hx - 2, hy - 0.6, hx - 3.6, hy + 0.6, 1.0, 0.45); line(hx - 2, hy - 0.4, hx - 3.4, hy + 1.6, 1.0, 0.4);
        break;
      case 'horn':
        pen.begin().arc(hx, hy - 0.5, 2.25, Math.PI, 0).fill(METAL_D);
        pen.begin().moveTo(hx - 1.6, hy - 1.6).quad(hx - 3.4, hy - 2.6, hx - 2.8, hy - 4.8).quad(hx - 2.2, hy - 2.8, hx - 0.6, hy - 2.2).fill('#efe6cc');
        pen.begin().moveTo(hx + 1.6, hy - 1.6).quad(hx + 3.4, hy - 2.6, hx + 2.8, hy - 4.8).quad(hx + 2.2, hy - 2.8, hx + 0.6, hy - 2.2).fill('#efe6cc');
        break;
      case 'wolf':
        pen.begin().arc(hx - 0.3, hy - 0.4, 2.5, Math.PI * 0.9, Math.PI * 2.05).fill('#8a7a6a');
        poly([hx - 1.6, hy - 2.4, hx - 1.2, hy - 4, hx - 0.2, hy - 2.6], '#8a7a6a');
        poly([hx + 0.4, hy - 2.6, hx + 1.2, hy - 4, hx + 1.6, hy - 2.2], '#8a7a6a');
        break;
      case 'fur':
        rbox(hx - 2.3, hy - 3.6, 4.6, 2.4, 1, '#7d5a3a');
        box(hx - 2.4, hy - 1.8, 4.8, 0.8, '#5d4128');
        break;
      case 'crown':
        poly([hx - 2.2, hy - 1.4, hx - 2.2, hy - 4, hx - 1.1, hy - 2.8, hx, hy - 4.4, hx + 1.1, hy - 2.8, hx + 2.2, hy - 4, hx + 2.2, hy - 1.4], '#f1c84a', '#a37a1a', 0.2);
        circ(hx, hy - 2.3, 0.4, '#d23');
        break;
      default:
        pen.begin().arc(hx - 0.2, hy - 0.4, 2.2, Math.PI * 0.95, Math.PI * 1.9).fill('#5a3a22');
    }
  }


  function xf(tx, ty, sc, ox, oy, fn) {
    for (const c of [cb, cm]) { c.save(); c.translate(tx, ty); c.scale(sc, sc); c.translate(-ox, -oy); }
    fn();
    cb.restore(); cm.restore();
  }
  function drawHead(L) { xf(8.2, 5.5, 1.72, 8, 4.6, () => drawHeadCore(L)); }

  // f: 0/1 walk frames, 2 attack  — chibi cartoon style
  function drawHuman(L, f, riding) {
    const tunic = L.tunic != null ? L.tunic : 1;
    const skin = L.skin || SKIN;
    const bodyC = L.bare ? skin : L.armor || tunic;
    const atk = f === 2;
    if (!riding) ell(8, 14.9, 4.6, 1.3, 'rgba(0,0,0,0.2)');
    // ---- back items
    if (L.cape) pen.begin().moveTo(6, 8.6).lineTo(10, 8.6).lineTo(8.6, 14.2).lineTo(3.4, 14.4).close().fill(0.8).stroke(OL, 0.3);
    if (L.quiver) { rbox(3.6, 7.6, 2, 4.6, 0.6, WOOD_D); line(4.1, 7.6, 3.6, 6.2, '#eee', 0.35); line(5, 7.6, 5.2, 6.1, '#eee', 0.35); }
    if (L.weapon === 'flamer') pen.begin().rrect(2.8, 8, 2.8, 5.4, 1.2).fill('#c4512a').stroke(OL, 0.3);
    if (L.weapon === 'bomb' && !atk) { pen.begin().arc(4.6, 10, 2.3).fill('#2a2a2a').stroke(OL, 0.3); line(4.6, 7.7, 4, 6.6, '#e0a030', 0.4); }
    // ---- feet
    if (!riding) {
      const s = f === 0 ? 0.9 : f === 1 ? -0.6 : 1.3;
      pen.begin().ell(6.5 - s, 14.1, 1.45, 0.95).fill('#3b3340');
      if (!L.robe) pen.begin().ell(9.7 + s, 14.1, 1.45, 0.95).fill('#4a4150');
    }
    // ---- back hand
    pen.begin().arc(atk ? 4.6 : 4.9, atk ? 10.2 : 11, 0.95).fill(skin).stroke(OL, 0.3);
    // ---- body
    if (L.robe) pen.begin().moveTo(5.3, 8.3).lineTo(10.7, 8.3).lineTo(11.6, 14.3).quad(8, 15, 4.4, 14.3).close().fill(tunic === 1 ? 0.92 : tunic).stroke(OL, 0.35);
    else pen.begin().rrect(4.8, 8.1, 6.4, 5.9, 2.6).fill(bodyC).stroke(OL, 0.35);
    if (L.armor) { rbox(7.2, 8.5, 1.8, 5.1, 0.6, tunic); }
    if (L.bare) { pen.begin().rrect(4.9, 11.3, 6.2, 2.5, 1).fill(tunic).stroke(OL, 0.25); }
    else if (!L.robe) line(5.1, 11.5, 10.9, 11.5, '#4a3428', 0.55);
    if (L.weapon === 'drum') {
      pen.begin().ell(10.4, 11.4, 2.3, 2).fill('#f0e4c8').stroke(OL, 0.3);
      pen.begin().ell(10.4, 11.4, 2.3, 2).stroke(1, 0.5);
    }
    // ---- head
    drawHead(L);
    // ---- front hand & weapon
    let hx, hy;
    switch (L.weapon) {
      case 'bow': hx = atk ? 12.6 : 11.6; hy = 9.6; break;
      case 'spear': hx = atk ? 12 : 11.2; hy = 10.4; break;
      case 'grenade': hx = atk ? 9.4 : 11.4; hy = atk ? 3.4 : 11.2; break;
      case 'bomb': hx = 8.6; hy = atk ? 2.2 : 11; break;
      case 'javelin': hx = atk ? 12.4 : 9.6; hy = atk ? 8.2 : 4.6; break;
      case 'staff': hx = atk ? 12 : 11.4; hy = atk ? 9 : 10.6; break;
      case 'book': hx = 11.2; hy = 10.6; break;
      case 'axe': hx = atk ? 12 : 11; hy = atk ? 10 : 10.8; break;
      case 'drum': hx = atk ? 11.8 : 11.2; hy = atk ? 8.6 : 10; break;
      default: hx = atk ? 12.4 : 11.3; hy = atk ? 9.6 : 11;
    }
    if (L.weapon === 'bomb' && atk) { pen.begin().arc(8.6, 0.6, 2.3).fill('#2a2a2a').stroke(OL, 0.3); line(8.6, -1.6, 9.4, -2.6, '#e0a030', 0.4); }
    if (L.shield === 'tower') {
      xf(hx, hy, 1.2, hx, hy, () => drawWeapon(L, f, hx, hy));
      pen.begin().rrect(9.4, 6.8, 3.4, 8, 1).fill(1.0).stroke(OL, 0.4);
      line(11.1, 8, 11.1, 13.6, 0.7, 0.55);
      return;
    }
    xf(hx, hy, 1.2, hx, hy, () => drawWeapon(L, f, hx, hy));
    pen.begin().arc(hx, hy, 0.95).fill(skin).stroke(OL, 0.3);
    if (L.shield === 'small') pen.begin().arc(atk ? 9.8 : 10.6, 11.2, 2.3).fill(0.9).stroke(OL, 0.35);
    if (L.shield === 'kite') pen.begin().moveTo(9.6, 8.6).lineTo(12.6, 8.8).lineTo(12.4, 12.4).lineTo(11, 14.4).lineTo(9.5, 12.2).close().fill(1.0).stroke(OL, 0.35);
  }

  function shade(hex, amt) {
    if (typeof hex === 'number') return hex;
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return `rgb(${r},${g},${b})`;
  }
  function shadeT(c, s) { return typeof c === 'number' ? c * s : shade(c, -30); }

  function drawHorse(f, col) {
    const leg = shade(col, -35);
    ell(11, 19.4, 7, 1.5, 'rgba(0,0,0,0.28)');
    // legs
    const k = f === 1 ? 1 : 0;
    const legs = f === 1 ? [[6.8, 5.6], [8.2, 9.4], [14.2, 13.4], [15.4, 16.8]] : f === 2 ? [[6.8, 4.6], [8.2, 7.6], [14.2, 16.4], [15.4, 18]] : [[6.8, 8], [8.2, 6.4], [14.2, 15.6], [15.4, 14]];
    for (let i = 0; i < 4; i++) {
      const c = i % 2 === 0 ? leg : col;
      line(legs[i][0], 14, legs[i][1], 18.8, c, 1.1);
      line(legs[i][1] - 0.3, 19, legs[i][1] + 0.6, 19, '#222', 0.8);
    }
    // tail
    pen.begin().moveTo(5.4, 12).quad(2.6, 13 + k, 3.4, 17).stroke('#3a2618', 1.0);
    // body
    rbox(5, 10.6, 12, 5, 2.4, col);
    // saddle cloth (team)
    poly([8.8, 10.6, 12.4, 10.6, 12.8, 15.2, 8.4, 15.2], 0.95);
    // neck & head
    poly([14.6, 11.4, 17.2, 6.6, 19.2, 6.8, 17.6, 12.4], col);
    rbox(17.2, 5.8, 4.6, 2.4, 1.1, col);
    circ(18.6, 6.4, 0.3, '#111');
    poly([16.8, 6.4, 17.6, 4.8, 18, 6.2], col);
    pen.begin().moveTo(17.2, 6.6).quad(15.4, 8.6, 14.8, 11.6).stroke('#3a2618', 0.8);
  }

  // ==================================================================== siege
  function wheel(x, y, r) {
    circ(x, y, r, WOOD_D); circ(x, y, r * 0.62, WOOD); circ(x, y, r * 0.22, '#3a2a1a');
    line(x - r * 0.7, y, x + r * 0.7, y, WOOD_D, 0.35); line(x, y - r * 0.7, x, y + r * 0.7, WOOD_D, 0.35);
  }
  function siege(k, f) {
    ell(13, 20.2, 11, 1.8, 'rgba(0,0,0,0.3)');
    if (k === 'catapult') {
      box(3, 15, 20, 2.2, WOOD_D);
      poly([10, 15, 13, 7.5, 16, 15], null, WOOD, 1);
      const a = f === 2 ? -0.9 : f === 1 ? 0.25 : 0.32;
      const cx = 13, cy = 8.5, L = 11;
      const ex = cx - Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.6;
      line(cx + Math.cos(a) * 3, cy - Math.sin(a) * 2, ex, ey - (f === 2 ? 8 : 0), WOOD, 1.1);
      const bx = ex, by = ey - (f === 2 ? 8 : 0);
      circ(bx, by, 1.8, WOOD_D);
      if (f !== 2) circ(bx, by - 0.6, 1.3, '#8d8a84');
      box(4, 12.6, 2.6, 2.6, '#6b6660');
      wheel(6, 17.6, 2.6); wheel(20, 17.6, 2.6);
      line(13, 7.5, 13, 3.4, '#555', 0.3); poly([13, 3.4, 16.4, 4.4, 13, 5.6], 1.0);
    } else if (k === 'ballista') {
      box(4, 14, 18, 2, WOOD_D);
      line(6, 12, 20, 11, WOOD, 1.4);
      const pull = f === 2 ? 0 : 3;
      pen.begin().moveTo(17, 5.4).quad(19.5, 11, 17, 16.6).stroke(WOOD_D, 1.0);
      line(17, 5.4, 17 - pull - 3, 11, '#ddd', 0.25); line(17 - pull - 3, 11, 17, 16.6, '#ddd', 0.25);
      if (f !== 2) { line(10 - pull, 11, 23, 10.6, '#4a3626', 0.7); poly([23, 9.8, 25, 10.6, 23, 11.4], '#cfd5da'); }
      wheel(7, 17, 2.4); wheel(18, 17, 2.4);
      box(4.2, 8, 1.8, 3, 1.0);
    } else if (k === 'cannon') {
      poly([5, 16, 8, 10.5, 16, 12, 17, 16], WOOD);
      const rec = f === 2 ? -1.5 : 0;
      pen.begin().moveTo(6 + rec, 10.6).lineTo(22 + rec, 8).lineTo(22.6 + rec, 11).lineTo(6.4 + rec, 13.8).close().fill('#2c2f33');
      box(21.6 + rec, 7.6, 1.5, 3.8, '#3b3f44');
      circ(6.2 + rec, 12.2, 1.6, '#3b3f44');
      wheel(11, 16.4, 3.4);
      box(3, 7.4, 1.6, 2.2, 1.0); line(3, 7.4, 3, 13, '#555', 0.3);
    } else if (k === 'ram') {
      const push = f === 2 ? 2.5 : 0;
      line(1 + push, 12.2, 24 + push, 12.2, '#6b4426', 2.2);
      circ(24.5 + push, 12.2, 1.6, '#555b61');
      poly([2, 13, 6, 4.5, 20, 4.5, 24, 13], 0.9, WOOD_D, 0.4);
      for (let i = 0; i < 4; i++) line(6 + i * 4.6, 5, 4 + i * 5.6, 13, shade(WOOD_D, -10), 0.25);
      box(3, 13, 20, 2.4, WOOD_D);
      wheel(6, 17.2, 2.6); wheel(13, 17.2, 2.6); wheel(20, 17.2, 2.6);
    }
  }

  // ==================================================================== buildings
  function flag(x, y, h, s = 1) {
    line(x, y, x, y - h, '#5b4a3a', 0.5 * s);
    pen.begin().moveTo(x, y - h).quad(x + 2.6 * s, y - h + 0.6 * s, x + 5 * s, y - h - 0.2 * s).lineTo(x + 5 * s, y - h + 3 * s).quad(x + 2.6 * s, y - h + 3.4 * s, x, y - h + 3 * s).close().fill(1.0);
  }
  function stoneRect(x, y, w, h, c1, c2) {
    box(x, y, w, h, c1);
    const bh = 2.2, bw = 3.6;
    for (let yy = y + bh, row = 0; yy < y + h; yy += bh, row++) {
      line(x, yy, x + w, yy, c2, 0.22);
      for (let xx = x + (row % 2 ? bw / 2 : 0); xx < x + w; xx += bw) line(xx, yy, xx, Math.min(yy + bh, y + h), c2, 0.22);
    }
  }
  function crenel(x, y, w, c) {
    for (let xx = x; xx < x + w - 0.5; xx += 2.2) box(xx, y - 1.4, 1.3, 1.5, c);
  }

  const BUILD = {
    hut(W, H) {
      ell(W / 2, H - 4.6, 14, 4, 'rgba(0,0,0,0.3)');
      // mud wall
      rbox(W / 2 - 10, H - 17, 20, 12, 3, '#c49a6c');
      line(W / 2 - 10, H - 11, W / 2 + 10, H - 11, '#a77c50', 0.4);
      rbox(W / 2 - 2.2, H - 12, 4.4, 7, 2, '#4a3220');
      // straw roof
      poly([W / 2 - 14, H - 15, W / 2, H - 31, W / 2 + 14, H - 15], '#d9b45a', '#a8833a', 0.5);
      for (let i = -12; i <= 12; i += 3) line(W / 2 + i, H - 15.4, W / 2 + i * 0.2, H - 28, '#b8903e', 0.3);
      // team band
      poly([W / 2 - 9, H - 21.5, W / 2 + 9, H - 21.5, W / 2 + 10.4, H - 19.5, W / 2 - 10.4, H - 19.5], 1.0);
      flag(W / 2 + 10, H - 6, 18, 0.9);
    },
    barracks(W, H) {
      ell(W / 2, H - 6.5, 24, 6, 'rgba(0,0,0,0.3)');
      box(W / 2 - 21, H - 23, 42, 17, '#d8c8a4');
      for (let i = -21; i <= 21; i += 7) line(W / 2 + i, H - 23, W / 2 + i, H - 6, '#7a5532', 0.9);
      line(W / 2 - 21, H - 15, W / 2 + 21, H - 15, '#7a5532', 0.8);
      poly([W / 2 - 24, H - 22, W / 2 - 18, H - 36, W / 2 + 18, H - 36, W / 2 + 24, H - 22], 0.95, '#3a2a1a', 0.5);
      for (let i = -16; i <= 16; i += 4) line(W / 2 + i * 1.15, H - 22.4, W / 2 + i, H - 35.6, 0.75, 0.3);
      rbox(W / 2 - 3.5, H - 15, 7, 9, 1.5, '#4a3220');
      box(W / 2 - 15, H - 20, 4, 3.4, '#3a3a44'); box(W / 2 + 11, H - 20, 4, 3.4, '#3a3a44');
      // weapon rack
      line(W / 2 + 15, H - 6, W / 2 + 15, H - 13, '#555', 0.5); line(W / 2 + 17, H - 6, W / 2 + 17.6, H - 13, '#555', 0.5);
      flag(W / 2 - 18, H - 35, 9, 1);
    },
    range(W, H) {
      ell(W / 2, H - 5.6, 21, 5, 'rgba(0,0,0,0.3)');
      // tent
      poly([W / 2 - 16, H - 6, W / 2 - 4, H - 30, W / 2 + 8, H - 6], 1.0, '#3a2a1a', 0.4);
      poly([W / 2 - 10, H - 6, W / 2 - 4, H - 30, W / 2 + 2, H - 6], '#f0e8d4');
      poly([W / 2 - 6.5, H - 6, W / 2 - 4, H - 14, W / 2 - 1.5, H - 6], '#3a2a1a');
      line(W / 2 - 4, H - 30, W / 2 - 4, H - 33, '#5b4a3a', 0.5);
      // target
      line(W / 2 + 12, H - 6, W / 2 + 13, H - 14, WOOD_D, 0.8); line(W / 2 + 18, H - 6, W / 2 + 17, H - 14, WOOD_D, 0.8);
      circ(W / 2 + 15, H - 16, 5, '#f4efe2'); circ(W / 2 + 15, H - 16, 3.5, '#d33'); circ(W / 2 + 15, H - 16, 2, '#f4efe2'); circ(W / 2 + 15, H - 16, 0.8, '#d33');
      line(W / 2 + 14, H - 16.5, W / 2 + 17.5, H - 18.5, '#5b4a3a', 0.3);
      flag(W / 2 - 4, H - 30, 6, 0.9);
    },
    stable(W, H) {
      ell(W / 2, H - 6.5, 24, 6, 'rgba(0,0,0,0.3)');
      box(W / 2 - 20, H - 22, 30, 16, '#9a5a32');
      for (let i = -20; i <= 10; i += 2.5) line(W / 2 + i, H - 22, W / 2 + i, H - 6, '#7d4524', 0.3);
      poly([W / 2 - 22, H - 21, W / 2 - 5, H - 36, W / 2 + 12, H - 21], 0.9, '#3a2a1a', 0.5);
      rbox(W / 2 - 10, H - 17, 9, 11, 1, '#5b3420');
      line(W / 2 - 10, H - 17, W / 2 - 1, H - 6, '#e8dcc0', 0.6); line(W / 2 - 1, H - 17, W / 2 - 10, H - 6, '#e8dcc0', 0.6);
      // fence
      for (let i = 0; i < 4; i++) line(W / 2 + 12 + i * 3.2, H - 6, W / 2 + 12 + i * 3.2, H - 12, '#c8a070', 0.6);
      line(W / 2 + 11, H - 10.5, W / 2 + 22, H - 10.5, '#c8a070', 0.5); line(W / 2 + 11, H - 8, W / 2 + 22, H - 8, '#c8a070', 0.5);
      ell(W / 2 + 15, H - 7, 3, 1.5, '#e0c060');
      flag(W / 2 - 5, H - 35, 7, 1);
    },
    workshop(W, H) {
      ell(W / 2, H - 6.5, 24, 6, 'rgba(0,0,0,0.3)');
      box(W / 2 - 18, H - 20, 28, 14, '#a58258');
      for (let i = -18; i <= 10; i += 3) line(W / 2 + i, H - 20, W / 2 + i, H - 6, '#80613c', 0.3);
      poly([W / 2 - 20, H - 19, W / 2 - 4, H - 31, W / 2 + 12, H - 19], 0.88, '#3a2a1a', 0.5);
      rbox(W / 2 - 8, H - 15, 10, 9, 1, '#4a3220');
      // crane
      line(W / 2 + 14, H - 6, W / 2 + 14, H - 32, WOOD_D, 1.2);
      line(W / 2 + 14, H - 31, W / 2 + 4, H - 33, WOOD_D, 1.0);
      line(W / 2 + 5, H - 33, W / 2 + 5, H - 25, '#444', 0.25);
      box(W / 2 + 3.6, H - 25, 2.8, 2.4, '#777');
      // gear
      circ(W / 2 + 19, H - 10, 3, '#6a6f74'); circ(W / 2 + 19, H - 10, 1.2, '#3a3d40');
      wheel(W / 2 - 16, H - 4.5, 2.4);
      flag(W / 2 - 4, H - 30.5, 6, 0.9);
    },
    tower(W, H) {
      ell(W / 2, H - 4, 11, 3.2, 'rgba(0,0,0,0.3)');
      stoneRect(W / 2 - 8, H - 40, 16, 36, '#a7a197', '#7f796f');
      box(W / 2 - 8, H - 40, 3, 36, 'rgba(255,255,255,0.12)');
      box(W / 2 + 5, H - 40, 3, 36, 'rgba(0,0,0,0.15)');
      box(W / 2 - 10, H - 43, 20, 4, '#b8b2a8');
      crenel(W / 2 - 10, H - 43, 20, '#b8b2a8');
      rbox(W / 2 - 1.5, H - 30, 3, 6, 1.5, '#2a2622');
      rbox(W / 2 - 2.2, H - 11, 4.4, 7, 2, '#4a3220');
      box(W / 2 - 9.6, H - 39, 19.2, 2.2, 0.9);
      flag(W / 2, H - 44, 9, 1);
    },
    magetower(W, H) {
      ell(W / 2, H - 4, 11, 3.2, 'rgba(0,0,0,0.3)');
      stoneRect(W / 2 - 7.5, H - 38, 15, 34, '#8a8296', '#625a70');
      box(W / 2 + 4.5, H - 38, 3, 34, 'rgba(0,0,0,0.15)');
      box(W / 2 - 9, H - 40, 18, 3, '#9a92a8');
      poly([W / 2 - 9, H - 40, W / 2, H - 56, W / 2 + 9, H - 40], 0.95, '#3a2a4a', 0.4);
      circ(W / 2, H - 57, 1.6, '#ffb24a');
      soft('rgba(255,180,80,0.9)', 'rgba(255,120,40,0)', 4, W / 2, H - 57);
      rbox(W / 2 - 1.6, H - 30, 3.2, 5, 1.6, '#ffb24a');
      rbox(W / 2 - 1.6, H - 20, 3.2, 5, 1.6, '#ffb24a');
      rbox(W / 2 - 2.2, H - 11, 4.4, 7, 2, '#3a2a4a');
    },
    bastion(W, H) {
      ell(W / 2, H - 5, 15, 4, 'rgba(0,0,0,0.3)');
      poly([W / 2 - 14, H - 6, W / 2 - 12, H - 20, W / 2 + 12, H - 20, W / 2 + 14, H - 6], '#9b968c');
      stoneRect(W / 2 - 12.6, H - 19, 25.2, 13, '#9b968c', '#77726a');
      box(W / 2 - 13, H - 22, 26, 3, '#b0aaa0');
      crenel(W / 2 - 13, H - 22, 26, '#b0aaa0');
      // cannon
      pen.begin().moveTo(W / 2 - 1, H - 23).lineTo(W / 2 + 12, H - 25.5).lineTo(W / 2 + 12.4, H - 23).lineTo(W / 2 - 1, H - 20.5).close().fill('#2c2f33');
      box(W / 2 - 12.6, H - 17, 25.2, 2, 0.9);
      flag(W / 2 - 8, H - 22, 8, 1);
    },
    temple(W, H) {
      ell(W / 2, H - 5.6, 21, 5, 'rgba(0,0,0,0.3)');
      box(W / 2 - 18, H - 8, 36, 3, '#d8d2c4'); box(W / 2 - 16, H - 10, 32, 2.4, '#e8e2d4');
      box(W / 2 - 14, H - 28, 28, 18, '#f2ede0');
      for (let i = 0; i < 5; i++) { box(W / 2 - 13 + i * 6, H - 27, 2.6, 17, '#fbf8f0'); line(W / 2 - 13 + i * 6 + 2.6, H - 27, W / 2 - 13 + i * 6 + 2.6, H - 10, '#cfc8b8', 0.4); }
      box(W / 2 - 16, H - 31, 32, 3, '#e8e2d4');
      poly([W / 2 - 17, H - 31, W / 2, H - 41, W / 2 + 17, H - 31], '#f6f2e8', '#bdb5a2', 0.4);
      poly([W / 2 - 11, H - 32.2, W / 2, H - 38.6, W / 2 + 11, H - 32.2], 1.0);
      circ(W / 2, H - 35, 1.4, '#ffe680');
      soft('rgba(160,255,170,0.6)', 'rgba(160,255,170,0)', 6, W / 2, H - 20);
    },
    castle(W, H) {
      const cx = W / 2;
      ell(cx, H - 10, 50, 12, 'rgba(0,0,0,0.32)');
      // back wall
      stoneRect(cx - 36, H - 60, 72, 12, '#958f84', '#726c62'); crenel(cx - 36, H - 60, 72, '#958f84');
      // keep
      stoneRect(cx - 15, H - 82, 30, 40, '#aaa398', '#837d72');
      box(cx + 10, H - 82, 5, 40, 'rgba(0,0,0,0.15)');
      box(cx - 17, H - 85, 34, 4, '#bdb6aa'); crenel(cx - 17, H - 85, 34, '#bdb6aa');
      box(cx - 15, H - 80, 30, 3, 0.9);
      rbox(cx - 2, H - 72, 4, 7, 2, '#2a2622'); rbox(cx - 9, H - 66, 3, 5, 1.5, '#2a2622'); rbox(cx + 6, H - 66, 3, 5, 1.5, '#2a2622');
      flag(cx, H - 86, 14, 1.6);
      // side walls
      stoneRect(cx - 40, H - 40, 12, 26, '#a39d92', '#7c766c');
      stoneRect(cx + 28, H - 40, 12, 26, '#a39d92', '#7c766c');
      // front wall
      stoneRect(cx - 36, H - 34, 72, 22, '#aea79c', '#888276');
      box(cx - 36, H - 37, 72, 3, '#c0b9ad'); crenel(cx - 36, H - 37, 72, '#c0b9ad');
      box(cx - 36, H - 32, 72, 2, 0.85);
      // gate
      pen.begin().moveTo(cx - 7, H - 12).lineTo(cx - 7, H - 24).arc(cx, H - 24, 7, Math.PI, 0).lineTo(cx + 7, H - 12).close().fill('#3a2a1c');
      for (let i = -5; i <= 5; i += 2.5) line(cx + i, H - 29, cx + i, H - 12, '#6a6f74', 0.45);
      line(cx - 7, H - 20, cx + 7, H - 20, '#6a6f74', 0.4); line(cx - 7, H - 16, cx + 7, H - 16, '#6a6f74', 0.4);
      // banners on front wall
      poly([cx - 26, H - 32, cx - 20, H - 32, cx - 20, H - 20, cx - 23, H - 22.5, cx - 26, H - 20], 1.0);
      poly([cx + 20, H - 32, cx + 26, H - 32, cx + 26, H - 20, cx + 23, H - 22.5, cx + 20, H - 20], 1.0);
      // 4 towers
      const tower = (tx, ty, h) => {
        stoneRect(tx - 7, ty - h, 14, h, '#b3aca0', '#8a8478');
        box(tx + 4, ty - h, 3, h, 'rgba(0,0,0,0.14)');
        poly([tx - 8.5, ty - h, tx, ty - h - 14, tx + 8.5, ty - h], 0.95, '#3a2a1a', 0.4);
        rbox(tx - 1.2, ty - h + 5, 2.4, 4, 1.2, '#2a2622');
        line(tx, ty - h - 14, tx, ty - h - 18, '#5b4a3a', 0.4);
        poly([tx, ty - h - 18, tx + 4, ty - h - 17, tx, ty - h - 15.6], 1.0);
      };
      tower(cx - 38, H - 48, 22); tower(cx + 38, H - 48, 22);
      tower(cx - 40, H - 10, 32); tower(cx + 40, H - 10, 32);
    },
    tent(W, H) {
      ell(W / 2, H - 4.6, 14, 4, 'rgba(0,0,0,0.3)');
      poly([W / 2 - 13, H - 6, W / 2, H - 26, W / 2 + 13, H - 6], 1.0, '#3a2a1a', 0.4);
      poly([W / 2 - 7, H - 6, W / 2, H - 26, W / 2 - 2, H - 6], '#f0e8d4');
      poly([W / 2 + 7, H - 6, W / 2, H - 26, W / 2 + 4, H - 6], '#f0e8d4');
      poly([W / 2 - 2.5, H - 6, W / 2, H - 13, W / 2 + 2.5, H - 6], '#2a1a10');
      flag(W / 2, H - 26, 7, 1.1);
      circ(W / 2 + 10, H - 8, 1.6, '#c9a43a');
    },
    barrel(W, H) {
      ell(W / 2, H - 1.8, 4.2, 1.3, 'rgba(0,0,0,0.3)');
      rbox(W / 2 - 3.6, H - 10, 7.2, 8.4, 2, '#9a6232');
      line(W / 2 - 3.6, H - 8, W / 2 + 3.6, H - 8, '#3a3a3a', 0.6); line(W / 2 - 3.6, H - 3.6, W / 2 + 3.6, H - 3.6, '#3a3a3a', 0.6);
      line(W / 2 - 1.5, H - 7, W / 2 + 1.5, H - 4.6, '#d22', 0.6); line(W / 2 + 1.5, H - 7, W / 2 - 1.5, H - 4.6, '#d22', 0.6);
      ell(W / 2, H - 10, 3.6, 1, '#b07a44');
    },
  };
  // building frame sizes (world)
  const BSIZE = {
    hut: [34, 36, 13], barracks: [52, 42, 20], range: [46, 40, 17], stable: [52, 42, 20], workshop: [52, 40, 20],
    tower: [26, 56, 10], magetower: [26, 62, 10], bastion: [34, 36, 13], temple: [44, 46, 17],
    castle: [116, 120, 40], tent: [32, 36, 12], barrel: [10, 12, 4],
  };

  // ==================================================================== build atlas
  G.buildAtlas = function () {
    const UN = G.UNITS;
    G.unitFrames = new Int32Array(UN.length * 3);
    for (const u of UN) {
      if (u.cat === 'build') {
        const [w, h, r] = BSIZE[u.k];
        // pivot so that footprint center (unit pos) sits ~0.62r above bottom
        const pv = (h - r * 0.62) / h;
        const fi = frame('b_' + u.k, w, h, 0.5, pv, () => BUILD[u.k](w, h));
        G.unitFrames[u.id * 3] = G.unitFrames[u.id * 3 + 1] = G.unitFrames[u.id * 3 + 2] = fi;
      } else if (u.cat === 'siege') {
        for (let f = 0; f < 3; f++) {
          const fi = frame('s_' + u.k + f, 26, 22, 0.5, 19.6 / 22, () => siege(u.k, f));
          G.unitFrames[u.id * 3 + f] = fi;
        }
      } else if (u.look.mount) {
        for (let f = 0; f < 3; f++) {
          const fi = frame('m_' + u.k + f, 25, 27, 12 / 25, 24.4 / 27, () => {
            cb.translate(1, 5); cm.translate(1, 5);
            drawHorse(f, u.look.mount);
            cb.save(); cm.save(); cb.translate(3, 0.6); cm.translate(3, 0.6);
            drawHuman(u.look, f, true);
            cb.restore(); cm.restore();
          });
          G.unitFrames[u.id * 3 + f] = fi;
        }
      } else {
        const sc = u.look.scale || 1;
        const sz = 16 * sc;
        for (let f = 0; f < 3; f++) {
          const fi = frame('h_' + u.k + f, 20 * sc, 23 * sc, 0.5, (14.6 + 7) / 23, () => {
            cb.translate(2 * sc, 7 * sc); cm.translate(2 * sc, 7 * sc);
            cb.scale(sc, sc); cm.scale(sc, sc);
            drawHuman(u.look, f, false);
          });
          G.unitFrames[u.id * 3 + f] = fi;
        }
      }
    }

    // ------------------------------------------------ terrain objects
    const tree = (v) => () => {
      ell(6, 15, 4.6, 1.4, 'rgba(0,0,0,0.3)');
      box(5.3, 10, 1.6, 5, '#6b4426');
      const c = ['#3f7a34', '#4a8a3a', '#356c2e'][v];
      circ(6, 7.4, 4.6, c); circ(3.6, 9, 3, shade(c, -12)); circ(8.6, 8.8, 3.1, shade(c, -18));
      circ(5, 5.6, 2.6, shade(c, 18)); circ(7.4, 5, 1.4, shade(c, 34));
    };
    for (let v = 0; v < 3; v++) frame('tree' + v, 12, 16, 0.5, 15 / 16, tree(v), false, true);
    frame('pine', 11, 17, 0.5, 16 / 17, () => {
      ell(5.5, 16, 4, 1.2, 'rgba(0,0,0,0.3)');
      box(4.8, 12.5, 1.4, 3.6, '#5a3a20');
      poly([0.6, 13, 5.5, 5.5, 10.4, 13], '#2f6a3a'); poly([1.6, 9.6, 5.5, 2.6, 9.4, 9.6], '#3a7a44'); poly([2.8, 6.4, 5.5, 0.4, 8.2, 6.4], '#4a8a50');
    }, false, true);
    frame('treeburnt', 12, 16, 0.5, 15 / 16, () => {
      ell(6, 15, 3.6, 1.1, 'rgba(0,0,0,0.3)');
      line(6, 15, 6, 6, '#2a2420', 1.3); line(6, 10, 3.4, 6.6, '#2a2420', 0.7); line(6, 8.5, 8.8, 5.6, '#2a2420', 0.7);
    }, false, true);
    for (let v = 0; v < 2; v++) frame('rock' + v, 10, 9, 0.5, 6.5 / 9, () => {
      ell(5, 7.6, 4.6, 1.2, 'rgba(0,0,0,0.3)');
      if (v === 0) { poly([0.6, 7.6, 1.6, 3.2, 4.6, 1.4, 8.4, 2.6, 9.6, 7.4], '#8f8c84'); poly([1.6, 3.2, 4.6, 1.4, 8.4, 2.6, 5, 4.4], '#b2afa6'); }
      else { poly([0.8, 7.6, 2.4, 2.4, 6.4, 1.2, 9.2, 4.6, 9, 7.6], '#85827b'); poly([2.4, 2.4, 6.4, 1.2, 9.2, 4.6, 5.4, 4], '#aaa79e'); circ(3, 6, 0.6, '#6a6862'); }
    }, false, true);
    frame('wall', 8.6, 13, 0.5, 9 / 13, () => {
      box(0, 3.4, 8.6, 9, '#8c877d'); // front face
      line(0, 6.4, 8.6, 6.4, '#6d6960', 0.25); line(0, 9.4, 8.6, 9.4, '#6d6960', 0.25);
      line(4, 3.4, 4, 6.4, '#6d6960', 0.25); line(1.8, 6.4, 1.8, 9.4, '#6d6960', 0.25); line(6.4, 6.4, 6.4, 9.4, '#6d6960', 0.25); line(4, 9.4, 4, 12.4, '#6d6960', 0.25);
      box(0, 0, 8.6, 3.6, '#b4afa4'); // top
      box(0, 12, 8.6, 1, 'rgba(0,0,0,0.25)');
    }, false, true);
    frame('wallcr', 8.6, 13, 0.5, 9 / 13, () => {
      box(0, 3.4, 8.6, 9, '#7d786f'); box(0, 0, 8.6, 3.6, '#9d988e');
      line(1, 4, 4, 9, '#3a3630', 0.4); line(4, 9, 3, 12, '#3a3630', 0.35); line(6, 2, 7.6, 7, '#3a3630', 0.35);
    }, false, true);
    frame('pali', 8.4, 14, 0.5, 11 / 14, () => {
      ell(4.2, 11.4, 4.4, 1.2, 'rgba(0,0,0,0.25)');
      for (let i = 0; i < 3; i++) {
        const x0 = 0.4 + i * 2.7;
        poly([x0, 11.6, x0, 3, x0 + 1.25, 0.8 + (i % 2), x0 + 2.5, 3, x0 + 2.5, 11.6], i % 2 ? '#8a6038' : '#9a6c40');
        line(x0 + 2.5, 3, x0 + 2.5, 11.6, '#5e3b1b', 0.25);
      }
      line(0, 6, 8.4, 6, '#5e3b1b', 0.5);
    }, false, true);
    frame('spikes', 8, 6, 0.5, 4.5 / 6, () => {
      for (let i = 0; i < 4; i++) { const x0 = 0.6 + i * 1.9 + (i % 2) * 0.3; poly([x0, 5, x0 + 0.8, 0.6 + (i % 2), x0 + 1.6, 5], '#7a5a34'); poly([x0 + 0.5, 2.4, x0 + 0.8, 0.6 + (i % 2), x0 + 1.1, 2.4], '#ddd'); }
    }, false, 'thin');

    // ------------------------------------------------ projectiles (pivot centre, pointing +x)
    frame('arrow', 8, 2, 0.5, 0.5, () => { line(0.6, 1, 7, 1, '#6b4426', 0.4); poly([6.4, 0.3, 8, 1, 6.4, 1.7], '#ccc'); line(0.4, 0.3, 1.6, 1, '#eee', 0.35); line(0.4, 1.7, 1.6, 1, '#eee', 0.35); }, false, 'thin');
    frame('bolt', 6, 2, 0.5, 0.5, () => { line(0.4, 1, 5, 1, '#4a3626', 0.6); poly([4.6, 0.3, 6, 1, 4.6, 1.7], '#bbb'); }, false, 'thin');
    frame('javelin', 12, 2, 0.5, 0.5, () => { line(0.4, 1, 10.4, 1, '#8a5a2b', 0.5); poly([10, 0.3, 12, 1, 10, 1.7], '#ddd'); }, false, 'thin');
    frame('tracer', 16, 2, 0.5, 0.5, () => { const g = cb.createLinearGradient(0, 0, 16, 0); g.addColorStop(0, 'rgba(255,230,140,0)'); g.addColorStop(1, 'rgba(255,250,210,1)'); cb.fillStyle = g; cb.fillRect(0, 0.6, 16, 0.8); }, false);
    frame('grenade', 3, 3, 0.5, 0.5, () => { circ(1.5, 1.6, 1.2, '#2a2a2a'); circ(1.1, 1.2, 0.35, '#666'); line(1.5, 0.4, 2.2, 0, '#e0a030', 0.3); }, false, 'thin');
    frame('fireball', 9, 9, 0.5, 0.5, () => { soft('rgba(255,250,200,1)', 'rgba(255,120,20,0)', 4.5, 4.5, 4.5); soft('rgba(255,255,230,1)', 'rgba(255,200,80,0)', 2, 4.5, 4.5); }, false);
    frame('stone', 5, 5, 0.5, 0.5, () => { poly([0.6, 2.6, 1.6, 0.6, 4, 0.8, 4.6, 3, 2.8, 4.6, 0.8, 4], '#8a8780'); circ(2, 1.8, 0.8, '#aaa79f'); }, false, 'thin');
    frame('bbolt', 16, 3, 0.5, 0.5, () => { line(0.6, 1.5, 13.6, 1.5, '#5a4030', 1.0); poly([13, 0.2, 16, 1.5, 13, 2.8], '#c8ced4'); poly([0.4, 0.2, 3, 1.5, 0.4, 2.8], 0.9); }, false, 'thin');
    frame('ball', 4, 4, 0.5, 0.5, () => { circ(2, 2, 1.7, '#1f2124'); circ(1.4, 1.4, 0.5, '#5a5e64'); }, false, 'thin');
    frame('shuriken', 4, 4, 0.5, 0.5, () => { poly([2, 0, 2.6, 1.4, 4, 2, 2.6, 2.6, 2, 4, 1.4, 2.6, 0, 2, 1.4, 1.4], '#c9d0d6'); circ(2, 2, 0.4, '#333'); }, false, 'thin');
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
    frame('splat', 8, 8, 0.5, 0.5, () => {
      cb.fillStyle = 'rgba(120,10,10,0.75)';
      for (let i = 0; i < 7; i++) { const a = i * 0.9, d = i === 0 ? 0 : 1.2 + (i % 3); cb.beginPath(); cb.arc(4 + Math.cos(a) * d, 4 + Math.sin(a) * d * 0.6, i === 0 ? 2 : 0.8 + (i % 2) * 0.5, 0, 7); cb.fill(); }
    }, false);
    frame('scorch', 16, 16, 0.5, 0.5, () => { soft('rgba(110,92,74,0.3)', 'rgba(110,92,74,0)', 8, 8, 8); }, false);
    frame('crater', 16, 12, 0.5, 0.5, () => { cb.fillStyle = 'rgba(40,34,26,0.55)'; cb.beginPath(); cb.ellipse(8, 6, 7.5, 5, 0, 0, 7); cb.fill(); cb.fillStyle = 'rgba(20,16,12,0.5)'; cb.beginPath(); cb.ellipse(8, 6.4, 4.5, 3, 0, 0, 7); cb.fill(); }, false);
    frame('rubble', 20, 14, 0.5, 0.5, () => {
      for (let i = 0; i < 26; i++) { const a = i * 2.39, d = Math.sqrt(i / 26) * 8; const x = 10 + Math.cos(a) * d, y = 7 + Math.sin(a) * d * 0.6; cb.fillStyle = ['#8a8478', '#6e695f', '#a39d92', '#5e4a36'][i % 4]; cb.beginPath(); cb.arc(x, y, 1 + (i % 3) * 0.5, 0, 7); cb.fill(); }
    }, false);
    frame('stuck', 5, 2, 0.15, 0.5, () => { line(0.2, 1, 5, 1, '#6b4426', 0.4); line(3.8, 0.3, 5, 1, '#eee', 0.35); line(3.8, 1.7, 5, 1, '#eee', 0.35); }, false);
    frame('shadow', 8, 3, 0.5, 0.5, () => { cb.fillStyle = 'rgba(0,0,0,0.3)'; cb.beginPath(); cb.ellipse(4, 1.5, 3.8, 1.3, 0, 0, 7); cb.fill(); }, false);

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
