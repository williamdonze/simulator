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
      case 'ar':
        if (atk) { line(hx - 3.2, hy + 0.5, hx + 5.4, hy - 0.2, '#2e2e35', 0.85); box(hx + 0.3, hy + 0.2, 0.8, 1.4, '#2e2e35'); }
        else { line(hx - 2.2, hy + 2, hx + 3.6, hy - 3.2, '#2e2e35', 0.85); box(hx - 0.2, hy - 0.6, 0.8, 1.3, '#2e2e35'); }
        break;
      case 'mg':
        if (atk) { line(hx - 3.6, hy + 0.5, hx + 6.6, hy - 0.2, '#2e2e35', 1.15); line(hx + 4.5, hy, hx + 5.4, hy + 2.2, '#555', 0.35); line(hx + 4.5, hy, hx + 3.6, hy + 2.2, '#555', 0.35); line(hx - 0.6, hy + 0.6, hx - 1.4, hy + 2.6, '#c9a43a', 0.5); }
        else { line(hx - 3, hy + 1.4, hx + 5, hy - 2.4, '#2e2e35', 1.15); line(hx - 0.4, hy + 0.4, hx - 1.4, hy + 2.4, '#c9a43a', 0.5); }
        break;
      case 'rpg': {
        const yy = atk ? hy - 0.6 : hy - 1;
        line(hx - 5.4, yy + 0.4, hx + 3.2, yy - 0.3, '#56603f', 1.25);
        poly([hx + 3, yy - 1.1, hx + 6, yy - 0.4, hx + 3, yy + 0.5], '#3c4030');
        if (atk) circ(hx - 6.2, yy + 0.5, 0.9, '#ffb347');
        break;
      }
      case 'pistol': line(hx, hy, hx + 2.2, hy - 0.4, '#2e2e35', 0.7); break;
      case 'smg':
        line(hx - 1.6, hy + 0.3, hx + 3.6, hy - 0.3, '#2e2e35', 0.85); box(hx + 0.2, hy + 0.2, 0.7, 1.2, '#2e2e35');
        break;
      case 'baton':
        if (atk) line(hx, hy, hx + 4.2, hy - 2.4, '#222', 0.6); else line(hx, hy, hx + 0.8, hy - 4.2, '#222', 0.6);
        break;
      case 'medkit':
        rbox(hx - 0.4, hy - 0.6, 2.8, 2.2, 0.4, '#f4f2ec'); box(hx + 0.75, hy - 0.35, 0.5, 1.7, '#d33'); box(hx + 0.15, hy + 0.25, 1.7, 0.5, '#d33');
        if (atk) { circ(hx + 2.2, hy - 3.6, 1.4, 'rgba(140,255,150,0.65)'); }
        break;
      case 'c4':
        rbox(hx - 1.2, hy - 0.8, 2.8, 1.8, 0.3, '#cdb873'); line(hx - 0.6, hy - 0.8, hx + 0.6, hy - 1.8, '#d33', 0.25); line(hx + 0.4, hy - 0.8, hx + 1.4, hy - 1.6, '#36f', 0.25);
        break;
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
      case 'combat':
      case 'medic': {
        const c = L.helmet === 'medic' ? '#f2f1ec' : '#5f6b45';
        pen.begin().arc(hx, hy - 0.3, 2.35, Math.PI, 0).fill(c);
        line(hx - 2.65, hy - 0.25, hx + 2.65, hy - 0.25, L.helmet === 'medic' ? '#c9c7c0' : '#4b5536', 0.55);
        if (L.helmet === 'medic') { box(hx - 0.25, hy - 2.3, 0.5, 1.4, '#d33'); box(hx - 0.7, hy - 1.85, 1.4, 0.5, '#d33'); }
        else line(hx - 2.05, hy - 1.05, hx + 2.05, hy - 1.05, 1.0, 0.4);
        break;
      }
      case 'beret':
        pen.begin().ell(hx - 0.4, hy - 1.7, 2.6, 1.05).fill(1.0);
        circ(hx + 1.2, hy - 1.7, 0.4, '#f0cf4a');
        break;
      case 'balaclava':
        pen.begin().arc(hx, hy, 2.2).fill('#26262c').stroke(OL, 0.2);
        rbox(hx - 0.1, hy - 0.85, 2.3, 1.1, 0.4, SKIN);
        circ(hx + 0.75, hy - 0.3, 0.26, '#111'); circ(hx + 1.6, hy - 0.3, 0.26, '#111');
        line(hx - 2.1, hy + 0.9, hx + 2.1, hy + 0.9, 1.0, 0.35);
        break;
      case 'riot':
        pen.begin().arc(hx, hy - 0.2, 2.45, Math.PI, 0).fill('#2b3440');
        pen.begin().arc(hx + 0.3, hy + 0.1, 2.4, -1.2, 0.9).fill('rgba(170,210,240,0.55)');
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
    if (L.vest) {
      line(5.6, 8.6, 9.6, 12.6, '#3f4630', 0.7);
      rbox(6.6, 10.6, 1.3, 1.4, 0.3, '#3f4630'); rbox(8.3, 10.6, 1.3, 1.4, 0.3, '#3f4630');
    }
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
      case 'rpg': hx = 10.4; hy = 9; break;
      case 'mg': hx = atk ? 11.6 : 11; hy = atk ? 10.4 : 11; break;
      case 'c4': hx = atk ? 10.6 : 11.2; hy = atk ? 6 : 11; break;
      case 'medkit': hx = 11.2; hy = 11; break;
      case 'javelin': hx = atk ? 12.4 : 9.6; hy = atk ? 8.2 : 4.6; break;
      case 'staff': hx = atk ? 12 : 11.4; hy = atk ? 9 : 10.6; break;
      case 'book': hx = 11.2; hy = 10.6; break;
      case 'axe': hx = atk ? 12 : 11; hy = atk ? 10 : 10.8; break;
      case 'drum': hx = atk ? 11.8 : 11.2; hy = atk ? 8.6 : 10; break;
      default: hx = atk ? 12.4 : 11.3; hy = atk ? 9.6 : 11;
    }
    if (L.weapon === 'bomb' && atk) { pen.begin().arc(8.6, 0.6, 2.3).fill('#2a2a2a').stroke(OL, 0.3); line(8.6, -1.6, 9.4, -2.6, '#e0a030', 0.4); }
    if (L.shield === 'riot') {
      xf(hx, hy, 1.2, hx, hy, () => drawWeapon(L, f, hx, hy));
      pen.begin().rrect(9.6, 6.6, 3.4, 8.2, 0.8).fill('rgba(175,205,235,0.88)').stroke(OL, 0.4);
      line(10.4, 9.6, 12.2, 9.6, 1.0, 0.8);
      line(10.2, 7.6, 10.2, 13.6, 'rgba(255,255,255,0.7)', 0.3);
      return;
    }
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

  // ==================================================================== modern vehicles
  const OLIVE = '#56603f', OLIVE_D = '#3f4630', GLASS = '#a8ddf5', STEEL = '#2e2e35';
  function tire(x, y, r, f) {
    circ(x, y, r, '#2f2b33'); circ(x, y, r * 0.48, '#8d9299');
    const a = f * 0.8;
    line(x - Math.cos(a) * r * 0.42, y - Math.sin(a) * r * 0.42, x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, '#5a5e64', 0.35);
  }
  function tracks(x, y, w, h, f) {
    rbox(x, y, w, h, h / 2, '#3b3740');
    const n = Math.round(w / 4.4);
    for (let k = 0; k < n; k++) circ(x + h / 2 + k * ((w - h) / (n - 1)), y + h / 2, h * 0.28, '#77727c');
    for (let xx = x + 1 + (f % 2) * 1.2; xx < x + w - 1; xx += 2.4) line(xx, y + 0.3, xx, y + 0.9, '#5d5864', 0.4);
  }
  const VEH = {
    jeep: [24, 18, 15.5, (f) => {
      tire(6, 13.4, 2.6, f); tire(18, 13.4, 2.6, f);
      pen.begin().moveTo(2.5, 13).lineTo(2.5, 9).lineTo(12.5, 8.6).lineTo(14, 7.6).lineTo(21.5, 8).lineTo(22, 13).close().fill(0.95);
      line(13.6, 7.8, 12.6, 4.8, GLASS, 0.9);
      line(5, 9, 5, 5.6, '#555', 0.6); line(5, 5.6, 9.5, 5.6, '#555', 0.6);
      circ(9.5, 4.6, 1.6, SKIN); pen.begin().arc(9.5, 4.3, 1.75, Math.PI, 0).fill('#5f6b45');
      line(10.6, 7.6, 11.2, 4.4, '#444', 0.5);
      line(10.4, 4.1, f === 2 ? 15.6 : 16.4, 3.6, STEEL, 0.85);
      if (f === 2) circ(17, 3.5, 1.1, '#ffd25a');
      circ(21.3, 9.6, 0.6, '#ffe9a0');
    }],
    apc: [28, 21, 18, (f) => {
      for (const xx of [6, 11, 17, 22]) tire(xx, 16, 2.3, f);
      pen.begin().moveTo(2, 15.6).lineTo(3, 9.4).lineTo(7, 7.4).lineTo(22, 7.4).lineTo(26.6, 10.4).lineTo(26, 15.6).close().fill(0.92);
      line(3, 12, 26, 12, OLIVE_D, 0.4);
      box(9.5, 9.2, 2, 1.4, GLASS); box(13.5, 9.2, 2, 1.4, GLASS);
      rbox(11, 4.4, 7, 3.4, 1.2, 0.8);
      line(17.4, 5.6, f === 2 ? 25 : 26.4, 5.2, STEEL, 0.95);
      if (f === 2) circ(27, 5.2, 1.2, '#ffd25a');
    }],
    tank: [34, 24, 20.5, (f) => {
      tracks(2.5, 14.2, 29, 6, f);
      pen.begin().moveTo(3, 14.6).lineTo(5, 10.6).lineTo(29, 10.6).lineTo(32, 13).lineTo(31, 14.6).close().fill(0.9);
      rbox(10, 5.6, 13, 5.6, 2.4, 1.0);
      rbox(13, 4.4, 4.4, 1.6, 0.6, 0.78);
      const rec = f === 2 ? 2 : 0;
      line(22, 7.9, 33.4 - rec, 7.5, '#3b3a35', 1.4);
      box(31.6 - rec, 6.7, 1.8, 1.6, '#3b3a35');
      if (f === 2) circ(33.6, 7.4, 1.8, '#ffd25a');
    }],
    artillery: [34, 23, 20, (f) => {
      line(3, 19, 14, 14, OLIVE_D, 1.2); line(5, 19.4, 14.5, 14.8, OLIVE, 1.0);
      const rec = f === 2 ? 2 : 0;
      line(14 - rec * 0.6, 11, 31 - rec, 3.2, '#4a4f3a', 1.6);
      box(28.6 - rec, 2.6, 2.2, 1.6, '#3b3f2e');
      pen.begin().moveTo(12, 14).lineTo(13, 8.4).lineTo(19, 8.4).lineTo(19.6, 14).close().fill(1.0);
      tire(15.5, 16.6, 3.5, f);
      if (f === 2) circ(32.4, 2.8, 1.8, '#ffd25a');
    }],
    mlrs: [31, 22, 19, (f) => {
      for (const xx of [6, 12, 24]) tire(xx, 17, 2.3, f);
      box(3, 13, 24, 2.6, OLIVE_D);
      rbox(20.5, 7.8, 7.6, 6.2, 1.6, 0.95);
      box(23.8, 8.8, 3.2, 2.3, GLASS);
      pen.begin().moveTo(2.8, 12.6).lineTo(4, 6.4).lineTo(18.4, 3.6).lineTo(19.2, 10.2).close().fill(0.82);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) circ(15.6 + r * 1.5 + c * 0.25, 4.9 + c * 1.35 + r * 0.2, 0.55, '#2b2b2b');
      if (f === 2) for (let k = 0; k < 3; k++) circ(3 + k * 1.2, 8 + k * 1.3, 1.2, '#ffd25a');
    }],
    aa: [31, 26, 22.5, (f) => {
      tracks(3, 16.4, 25, 6, f);
      pen.begin().moveTo(3.4, 16.8).lineTo(5, 13).lineTo(26, 13).lineTo(28, 15.4).lineTo(27.4, 16.8).close().fill(0.9);
      rbox(9, 8.6, 11, 5.4, 2, 1.0);
      line(16, 9.6, 27, 2.6, STEEL, 0.8); line(17, 11, 28.4, 4, STEEL, 0.8);
      line(10.4, 8.8, 9.6, 4.6, '#555', 0.5);
      pen.begin().ell(9.2, 4, f === 1 ? 1.4 : 2.7, 1.1).fill('#c3c9d0');
      if (f === 2) { circ(27.6, 2.2, 1.1, '#ffd25a'); circ(29, 3.6, 1.1, '#ffd25a'); }
    }],
  };
  const AIRC = {
    fpv: [14, 10, (f) => {
      line(2.4, 4, 11.6, 4, '#3a3640', 0.7);
      const w = f === 1 ? 2.8 : 2.2;
      pen.begin().ell(2.4, 3.2, w, 0.55).fill('rgba(60,60,72,0.45)');
      pen.begin().ell(11.6, 3.2, w, 0.55).fill('rgba(60,60,72,0.45)');
      rbox(4.5, 3.5, 5, 3, 1.2, 1.0);
      circ(9.6, 5, 0.75, '#222');
      rbox(5.2, 6.4, 3.6, 1.7, 0.6, '#d4682a');
    }],
    bomber: [18, 14, (f) => {
      line(2, 4.6, 16, 4.6, '#3a3640', 0.8);
      const w = f === 1 ? 2.9 : 2.3;
      for (const xx of [2.2, 9, 15.8]) pen.begin().ell(xx, 3.6, w, 0.6).fill('rgba(60,60,72,0.45)');
      line(9, 4.6, 9, 3.6, '#3a3640', 0.6);
      rbox(5.6, 4.2, 6.8, 3.6, 1.4, 1.0);
      line(6.4, 7.8, 5.6, 9.4, '#3a3640', 0.4); line(11.6, 7.8, 12.4, 9.4, '#3a3640', 0.4);
      pen.begin().ell(9, 10, 1.3, 2).fill('#3a3a3a');
      line(9, 11.8, 9, 12.6, '#3a3a3a', 0.9);
    }],
    heli: [34, 19, (f) => {
      pen.begin().ell(18, 2.4, f === 1 ? 15 : 13.5, 0.9).fill('rgba(50,50,62,0.42)');
      line(18, 2.8, 18, 5.6, '#3a3640', 0.6);
      pen.begin().moveTo(3, 7.4).lineTo(17, 7).lineTo(17, 10.6).lineTo(3, 8.8).close().fill(0.8);
      poly([2, 8.4, 3, 4.6, 5.2, 8.2], 0.75);
      pen.begin().arc(3, 6.2, f === 1 ? 2.4 : 2, 0, 7).fill('rgba(50,50,62,0.35)');
      pen.begin().ell(20, 9.6, 8.4, 4.3).fill(1.0);
      pen.begin().ell(24.6, 8.6, 3.4, 2.5).fill(GLASS);
      line(14, 15.6, 26, 15.6, '#3a3640', 0.6); line(16.5, 13.4, 16, 15.6, '#3a3640', 0.45); line(23.5, 13.4, 24, 15.6, '#3a3640', 0.45);
      rbox(16, 12.4, 6, 1.6, 0.6, OLIVE);
    }],
    jet: [30, 14, (f) => {
      if (f !== 1) pen.begin().ell(1.4, 7.2, 1.8, 0.8).fill('#ffb040');
      pen.begin().moveTo(2.4, 7.6).lineTo(5, 5.6).lineTo(22, 5.3).lineTo(28.6, 7).lineTo(22, 8.8).lineTo(5, 8.8).close().fill(1.0);
      pen.begin().ell(21, 5.7, 3, 1.4).fill(GLASS);
      poly([3, 6, 4.4, 1.8, 8, 1.8, 8.2, 6], 0.85);
      poly([10, 7.6, 17, 7.6, 12.4, 12.8, 8.2, 12.8], 0.8);
      pen.begin().ell(13.4, 10.6, 2.2, 0.7).fill('#3a3a3a');
    }],
  };

  // ==================================================================== modern buildings
  function sandbags(x0, y0, w, rows) {
    for (let r = 0; r < rows; r++) for (let xx = x0 + (r % 2) * 1.6; xx < x0 + w - 1; xx += 3.2) pen.begin().rrect(xx, y0 - r * 1.8, 3, 2, 0.9).fill('#cdb98c').stroke('#9e8b62', 0.25);
  }
  const BUILD = {
    bunker(W, H) {
      ell(W / 2, H - 4.5, 17, 4, 'rgba(0,0,0,0.18)');
      pen.begin().moveTo(4, H - 5).quad(W / 2, H - 30, W - 4, H - 5).close().fill('#b9b6ae');
      pen.begin().moveTo(9, H - 9).quad(W / 2, H - 25, W - 9, H - 9).close().fill('#c9c6be');
      rbox(W / 2 - 7, H - 15, 14, 2.4, 1, '#2a2622');
      line(W / 2 - 9, H - 19, W / 2 + 9, H - 19, 1.0, 1.0);
      sandbags(3, H - 5, W - 6, 2);
      flag(W / 2 + 10, H - 18, 9, 0.9);
    },
    turret(W, H) {
      ell(W / 2, H - 3.5, 9, 2.6, 'rgba(0,0,0,0.18)');
      rbox(W / 2 - 6, H - 8, 12, 5, 1, '#b4b1aa');
      line(W / 2, H - 8, W / 2, H - 12, '#555', 1.0);
      rbox(W / 2 - 4.5, H - 16.5, 9, 5.4, 1.8, 1.0);
      circ(W / 2 - 1, H - 13.8, 1, '#ff5040');
      line(W / 2 + 3, H - 14, W / 2 + 9.6, H - 14.8, STEEL, 1.0);
    },
    sam(W, H) {
      ell(W / 2, H - 4, 13, 3.4, 'rgba(0,0,0,0.18)');
      rbox(3, H - 9, W - 6, 4.5, 1, OLIVE);
      line(4, H - 7, W - 4, H - 7, 1.0, 0.8);
      pen.begin().moveTo(6, H - 9).lineTo(20, H - 20).lineTo(23, H - 17).lineTo(10, H - 9).close().fill(OLIVE_D);
      for (let k = 0; k < 3; k++) { line(8 + k * 2.2, H - 12 + k * 0.9, 21 + k * 1.2, H - 22.5 + k * 1.6, '#f2f2ee', 1.1); circ(21 + k * 1.2, H - 22.5 + k * 1.6, 0.6, '#d33'); }
      line(W - 6, H - 9, W - 6, H - 20, '#555', 0.6);
      pen.begin().ell(W - 6, H - 21, 2.8, 1.2).fill('#c3c9d0');
    },
    barracks(W, H) {
      ell(W / 2, H - 6, 24, 5, 'rgba(0,0,0,0.18)');
      box(W / 2 - 21, H - 21, 42, 15, '#e9e4d8');
      poly([W / 2 - 23, H - 20, W / 2 - 21, H - 28, W / 2 + 21, H - 28, W / 2 + 23, H - 20], 0.95);
      for (let k = -3; k <= 3; k++) if (k) box(W / 2 + k * 5.6 - 1.6, H - 17.5, 3.2, 2.6, GLASS);
      rbox(W / 2 - 2.6, H - 14, 5.2, 8, 0.8, '#6b6b70');
      sandbags(W / 2 - 22, H - 5, 14, 1); sandbags(W / 2 + 8, H - 5, 14, 1);
      flag(W / 2 + 16, H - 28, 8, 1);
    },
    factory(W, H) {
      ell(W / 2, H - 7, 29, 6, 'rgba(0,0,0,0.18)');
      box(W / 2 - 26, H - 26, 52, 20, '#c9c6bf');
      for (let k = 0; k < 4; k++) poly([W / 2 - 26 + k * 13, H - 26, W / 2 - 26 + k * 13, H - 35, W / 2 - 13 + k * 13, H - 26], 0.92);
      box(W / 2 + 14, H - 44, 5, 18, '#9a978f'); box(W / 2 + 13.4, H - 45.6, 6.2, 2.2, '#5a5850');
      box(W / 2 - 15, H - 20, 20, 14, '#f0c43a');
      for (let k = 0; k < 6; k++) line(W / 2 - 15, H - 18 + k * 2.2, W / 2 + 5, H - 18 + k * 2.2, '#3a3630', 0.6);
      box(W / 2 + 9, H - 20, 10, 5, GLASS);
      flag(W / 2 - 22, H - 26, 9, 1);
    },
    helipad(W, H) {
      ell(W / 2 - 3, H - 11, 19, 8.6, '#8f8f8b');
      pen.begin().ell(W / 2 - 3, H - 11, 15, 6.6).stroke(1.0, 1.4);
      line(W / 2 - 8, H - 15, W / 2 - 8, H - 7, '#fff', 1.4); line(W / 2 + 2, H - 15, W / 2 + 2, H - 7, '#fff', 1.4); line(W / 2 - 8, H - 11, W / 2 + 2, H - 11, '#fff', 1.4);
      box(W - 9, H - 24, 6, 14, '#d9d6cf'); box(W - 10, H - 26.5, 8, 3, GLASS); line(W - 6, H - 26.5, W - 6, H - 31, '#555', 0.5);
      poly([W - 6, H - 31, W - 1.5, H - 30.2, W - 6, H - 29.4], '#ff8c2a');
    },
    dronebase(W, H) {
      ell(W / 2, H - 5, 16, 3.6, 'rgba(0,0,0,0.18)');
      box(W / 2 - 14, H - 17, 28, 12, 0.92);
      for (let k = -12; k <= 12; k += 3) line(W / 2 + k, H - 17, W / 2 + k, H - 5, 0.75, 0.35);
      line(W / 2 + 10, H - 17, W / 2 + 10, H - 30, '#555', 0.6); pen.begin().ell(W / 2 + 10, H - 30, 2.6, 1.1).fill('#c3c9d0');
      for (const xx of [-8, -1]) { line(W / 2 + xx - 3, H - 19, W / 2 + xx + 3, H - 19, '#3a3640', 0.5); rbox(W / 2 + xx - 1.5, H - 19.6, 3, 1.6, 0.5, '#3a3640'); }
    },
    hospital(W, H) {
      ell(W / 2, H - 5, 20, 4.4, 'rgba(0,0,0,0.18)');
      pen.begin().moveTo(W / 2 - 19, H - 5).lineTo(W / 2 - 19, H - 16).quad(W / 2, H - 32, W / 2 + 19, H - 16).lineTo(W / 2 + 19, H - 5).close().fill('#f4f2ec');
      line(W / 2 - 19, H - 16, W / 2 + 19, H - 16, '#d6d3cb', 0.6);
      circ(W / 2, H - 19, 5, '#fff'); box(W / 2 - 1.2, H - 23, 2.4, 8, '#d33'); box(W / 2 - 4, H - 20.2, 8, 2.4, '#d33');
      rbox(W / 2 - 3, H - 12, 6, 7, 1, '#7a8088');
      flag(W / 2 + 15, H - 16, 8, 0.9);
    },
    hq(W, H) {
      const cx = W / 2;
      ell(cx, H - 9, 44, 10, 'rgba(0,0,0,0.18)');
      box(cx - 36, H - 46, 72, 38, '#d4d1c9');
      box(cx - 36, H - 46, 72, 4, '#bcb9b1');
      for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) box(cx - 32 + c * 7.6, H - 39 + r * 9, 4.4, 4.6, GLASS);
      box(cx - 36, H - 14, 72, 3, 1.0);
      rbox(cx - 6, H - 20, 12, 12, 1, '#6b6b70');
      box(cx - 24, H - 58, 18, 12, '#c4c1b9'); pen.begin().arc(cx + 14, H - 50, 9, Math.PI, 0).fill('#eceae4');
      line(cx - 28, H - 46, cx - 28, H - 66, '#555', 0.6); line(cx - 30, H - 60, cx - 26, H - 60, '#555', 0.5);
      flag(cx - 10, H - 58, 10, 1.4); flag(cx + 30, H - 46, 9, 1.2);
      sandbags(cx - 40, H - 6, 30, 2); sandbags(cx + 10, H - 6, 30, 2);
    },
    mine(W, H) {
      pen.begin().ell(W / 2, H - 2.6, 3.6, 1.8).fill('#4a4d44');
      pen.begin().ell(W / 2, H - 3.2, 2.2, 1).fill(0.9);
      circ(W / 2, H - 3.4, 0.5, '#ff4030');
    },
    fuel(W, H) {
      ell(W / 2, H - 3, 11, 2.6, 'rgba(0,0,0,0.18)');
      for (const xx of [-5, 5]) {
        rbox(W / 2 + xx - 4.5, H - 19, 9, 16, 2.5, '#eeeae2');
        box(W / 2 + xx - 4.5, H - 13, 9, 2.2, '#e0452f');
        pen.begin().ell(W / 2 + xx, H - 19, 4.5, 1.3).fill('#d8d4ca');
      }
      poly([W / 2, H - 9, W / 2 + 2.2, H - 6, W / 2 - 2.2, H - 6], '#f2c230');
    },
  };
  const BSIZE = {
    bunker: [36, 30, 13], turret: [22, 22, 7], sam: [30, 30, 11], barracks: [52, 34, 20], factory: [62, 50, 24],
    helipad: [48, 34, 18], dronebase: [38, 34, 14], hospital: [44, 36, 17], hq: [92, 72, 34], mine: [9, 6, 3], fuel: [24, 24, 8],
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
      } else if (u.cat === 'veh') {
        const [w, h, g, fn] = VEH[u.k];
        for (let f = 0; f < 3; f++) {
          const fi = frame('v_' + u.k + f, w, h, 0.5, g / h, () => { ell(w / 2, g - 0.3, w * 0.44, 1.8, 'rgba(0,0,0,0.2)'); fn(f); });
          G.unitFrames[u.id * 3 + f] = fi;
        }
      } else if (u.cat === 'air') {
        const [w, h, fn] = AIRC[u.k];
        for (let f = 0; f < 3; f++) {
          const fi = frame('a_' + u.k + f, w, h, 0.5, 0.5, () => fn(f));
          G.unitFrames[u.id * 3 + f] = fi;
        }
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
      box(0, 3.4, 8.6, 9, '#b9b7b1');
      box(0, 0, 8.6, 3.6, '#dad8d2');
      line(4.3, 3.4, 4.3, 12.4, '#a19f99', 0.25);
      circ(2, 6, 0.3, '#9a9892'); circ(6.6, 9.4, 0.3, '#9a9892');
    }, false, true);
    frame('wallcr', 8.6, 13, 0.5, 9 / 13, () => {
      box(0, 3.4, 8.6, 9, '#a9a7a1'); box(0, 0, 8.6, 3.6, '#c8c6c0');
      line(1, 4, 4, 9, '#4a4640', 0.4); line(4, 9, 3, 12, '#4a4640', 0.35); line(6, 2, 7.6, 7, '#4a4640', 0.35);
    }, false, true);
    frame('pali', 8.6, 10, 0.5, 7.5 / 10, () => {
      for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) pen.begin().rrect(0.2 + k * 4.2 - (r % 2) * 1.6 + 0.8, 6.6 - r * 2.4, 4, 2.6, 1.1).fill('#d2bf92').stroke('#9e8b62', 0.3);
    }, false, true);
    frame('spikes', 8, 7, 0.5, 5.5 / 7, () => {
      line(0.8, 6, 0.8, 1, '#6b5a44', 0.5); line(7.2, 6, 7.2, 1, '#6b5a44', 0.5);
      pen.begin(); cb.lineWidth = cm.lineWidth = 0.3;
      for (let k = 0; k < 3; k++) { cb.beginPath(); for (let xx = 0; xx <= 8; xx += 0.5) { const yy = 2 + k * 1.4 + Math.sin(xx * 2.2 + k) * 0.7; xx === 0 ? cb.moveTo(xx, yy) : cb.lineTo(xx, yy); } cb.strokeStyle = '#55575c'; cb.stroke(); }
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
    frame('rocket', 10, 3, 0.5, 0.5, () => { rbox(1, 0.9, 7, 1.2, 0.5, '#5a6046'); poly([8, 0.7, 10, 1.5, 8, 2.3], '#3c4030'); poly([1, 0.4, 2.4, 1.5, 1, 2.6], '#3c4030'); }, false, 'thin');
    frame('missile', 13, 3, 0.5, 0.5, () => { rbox(1, 0.9, 10, 1.2, 0.5, '#f2f2ee'); poly([11, 0.8, 13, 1.5, 11, 2.2], '#d33'); poly([1, 0.2, 3, 1.5, 1, 2.8], '#9a9a9a'); }, false, 'thin');
    frame('shell', 6, 3, 0.5, 0.5, () => { rbox(0.6, 0.6, 4, 1.8, 0.6, '#c9a43a'); poly([4.4, 0.6, 6, 1.5, 4.4, 2.4], '#5a5a5a'); }, false, 'thin');
    frame('mrl', 8, 2.4, 0.5, 0.5, () => { rbox(0.8, 0.7, 5.6, 1, 0.4, '#f0eee6'); poly([6.2, 0.5, 8, 1.2, 6.2, 1.9], '#d33'); }, false, 'thin');
    frame('bomb', 7, 4, 0.5, 0.5, () => { pen.begin().ell(4, 2, 2.6, 1.4).fill('#3a3a3a'); poly([0.4, 0.6, 1.8, 2, 0.4, 3.4], '#3a3a3a'); }, false, 'thin');
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
    frame('crater', 16, 12, 0.5, 0.5, () => { cb.fillStyle = 'rgba(120,104,84,0.3)'; cb.beginPath(); cb.ellipse(8, 6, 7.5, 5, 0, 0, 7); cb.fill(); cb.fillStyle = 'rgba(90,76,60,0.3)'; cb.beginPath(); cb.ellipse(8, 6.4, 4.5, 3, 0, 0, 7); cb.fill(); }, false);
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
