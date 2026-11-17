'use strict';
// ============================================================================
//  UI: toolbar, painting, camera, HUD, scenarios
// ============================================================================
(function () {
  const S = G.S, F = G.F, T = G.T;
  const $ = (s) => document.querySelector(s);
  const ui = (G.ui = {
    opts: { bars: false, ff: false },
    tool: { kind: 'unit', id: G.U.soldier },
    team: -1, // -1 auto
    brush: 40,
    density: 1,
    running: false,
    speed: 1,
    snapshot: null,
    brushPreview: null,
    showMid: () => ui.team === -1,
  });

  const SIZES = { S: [1600, 896], M: [2400, 1344], L: [3200, 1792], XL: [4800, 2688] };
  ui.size = 'M';

  // ------------------------------------------------------------------ tabs
  const TABS = [
    { name: 'Mêlée', items: ['peasant', 'soldier', 'spear', 'shield', 'knight', 'barbarian', 'berserk', 'king'] },
    { name: 'Tireurs', items: ['archer', 'xbow', 'javelin', 'musket', 'sniper', 'grenadier', 'flamer', 'mage'] },
    { name: 'Spéciaux', items: ['cavalry', 'harcher', 'monk', 'drummer', 'ninja', 'sapper'] },
    { name: 'Siège', items: ['catapult', 'ballista', 'cannon', 'ram'] },
    { name: 'Bâtiments', items: ['hut', 'barracks', 'range', 'stable', 'workshop', 'tent', 'temple', 'tower', 'magetower', 'bastion', 'castle', 'barrel'] },
    { name: 'Terrain', terrain: ['FOREST', 'TALL', 'WATER', 'DEEP', 'MUD', 'SAND', 'ROAD', 'ROCK', 'WALL', 'PALI', 'SPIKES'] },
    { name: 'Outils', tools: ['erase', 'eraseUnits', 'fire', 'grass'] },
  ];
  const TOOLS = {
    erase: { name: 'Gomme totale', desc: 'Efface unités, bâtiments et terrain.' },
    eraseUnits: { name: 'Gomme unités', desc: 'Efface uniquement les unités et bâtiments.' },
    fire: { name: 'Torche', desc: 'Met le feu au terrain et aux unités sous le pinceau.' },
    grass: { name: 'Prairie', desc: 'Repeint le sol en herbe (efface le terrain).' },
  };

  let curTab = 0;
  const iconCache = {};
  function unitIcon(id, team) {
    const key = id + ':' + team;
    if (!iconCache[key]) iconCache[key] = G.frameIcon(G.unitFrames[id * 3], 96, G.TEAM_RGB[team]);
    return iconCache[key];
  }
  function terrainIcon(k) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d');
    const col = G.TERRAIN[T[k]].col;
    x.fillStyle = `rgb(${col})`;
    x.beginPath(); x.roundRect(10, 10, 76, 76, 18); x.fill();
    const fr = { FOREST: 'tree0', ROCK: 'rock0', WALL: 'wall', PALI: 'pali', SPIKES: 'spikes' }[k];
    if (fr) {
      const f = G.frames[G.FR[fr]];
      const s = Math.min(60 / f.w, 60 / f.h) * (k === 'WALL' || k === 'PALI' ? 1 : 1);
      const draw = (dx, dy) => x.drawImage(G.atlasBase, f.x, f.y, f.w, f.h, dx - f.w * s / 2, dy - f.h * s / 2, f.w * s, f.h * s);
      if (k === 'WALL' || k === 'PALI') { for (let i = -1; i <= 1; i++) draw(48 + i * f.w * s * 0.95, 50); }
      else draw(48, 48);
    }
    if (k === 'WATER' || k === 'DEEP') { x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 4; x.beginPath(); x.moveTo(26, 44); x.quadraticCurveTo(38, 36, 50, 44); x.quadraticCurveTo(62, 52, 72, 44); x.stroke(); }
    return c.toDataURL();
  }
  function toolIcon(k) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d');
    x.font = '54px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (k === 'grass') { x.fillStyle = 'rgb(112,170,78)'; x.beginPath(); x.roundRect(10, 10, 76, 76, 18); x.fill(); }
    else x.fillText({ erase: '🧽', eraseUnits: '✖️', fire: '🔥' }[k], 48, 52);
    return c.toDataURL();
  }

  function iconTeam() { return ui.team === -1 ? 0 : ui.team; }

  function renderTabs() {
    const tabs = $('#tabs');
    tabs.innerHTML = '';
    TABS.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'tab' + (i === curTab ? ' on' : '');
      b.textContent = t.name;
      b.onclick = () => { curTab = i; renderTabs(); renderTools(); };
      tabs.appendChild(b);
    });
  }
  function renderTools() {
    const row = $('#tools');
    row.innerHTML = '';
    const tab = TABS[curTab];
    const add = (label, icon, active, onclick, info) => {
      const b = document.createElement('button');
      b.className = 'tool' + (active ? ' on' : '');
      b.innerHTML = `<img src="${icon}" alt=""><span>${label}</span>`;
      b.onclick = onclick;
      b.onmouseenter = () => showTip(info, b);
      b.onmouseleave = hideTip;
      row.appendChild(b);
    };
    if (tab.items) for (const k of tab.items) {
      const id = G.U[k], u = G.UNITS[id];
      const tm = u.flags & F.NEUTRAL ? 4 : iconTeam();
      add(u.name, unitIcon(id, tm), ui.tool.kind === 'unit' && ui.tool.id === id, () => { ui.tool = { kind: 'unit', id }; renderTools(); }, { unit: u });
    }
    if (tab.terrain) for (const k of tab.terrain) {
      const tt = T[k], t = G.TERRAIN[tt];
      add(t.name, terrainIcon(k), ui.tool.kind === 'terrain' && ui.tool.id === tt, () => { ui.tool = { kind: 'terrain', id: tt }; renderTools(); }, { name: t.name, desc: t.desc });
    }
    if (tab.tools) for (const k of tab.tools) {
      add(TOOLS[k].name, toolIcon(k), ui.tool.kind === k, () => { ui.tool = { kind: k }; renderTools(); }, TOOLS[k]);
    }
  }

  // ------------------------------------------------------------------ tooltip
  const tip = $('#tip');
  function showTip(info, el) {
    let h = '';
    if (info.unit) {
      const u = info.unit;
      h = `<b>${u.name}</b><p>${u.desc}</p><div class="st">`;
      h += `<span>❤ ${u.hp}</span>`;
      if (u.arm) h += `<span>🛡 ${u.arm}</span>`;
      if (u.dmg && u.beh !== G.B.HEAL) h += `<span>⚔ ${u.dmg}${u.aoe ? ' (zone)' : ''}</span>`;
      if (u.heal) h += `<span>✚ ${u.heal}/s</span>`;
      if (u.rng && u.cat !== 'build') h += `<span>🎯 ${u.rng}</span>`;
      if (u.rng && u.cat === 'build') h += `<span>🎯 ${u.rng}</span>`;
      if (u.spd) h += `<span>👟 ${u.spd}</span>`;
      if (u.every) h += `<span>⏱ ${u.every}s</span>`;
      h += '</div>';
    } else h = `<b>${info.name}</b><p>${info.desc || ''}</p>`;
    tip.innerHTML = h;
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px';
    tip.style.top = r.top - tip.offsetHeight - 10 + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }

  // ------------------------------------------------------------------ teams
  function renderTeams() {
    const box = $('#teams');
    box.innerHTML = '';
    const opts = [[-1, 'Auto', 'linear-gradient(90deg, rgb(222,58,52) 50%, rgb(52,112,240) 50%)'], [0], [1], [2], [3]];
    for (const [tm, label, bg] of opts) {
      const b = document.createElement('button');
      b.className = 'team' + (ui.team === tm ? ' on' : '');
      b.title = tm === -1 ? 'Auto : rouge à gauche, bleu à droite' : 'Équipe ' + G.TEAM_NAMES[tm];
      b.style.background = bg || `rgb(${G.TEAM_RGB[tm]})`;
      b.textContent = tm === -1 ? 'A' : '';
      b.onclick = () => { ui.team = tm; renderTeams(); renderTools(); updateLabels(); };
      box.appendChild(b);
    }
  }
  function updateLabels() {
    $('#labels').style.display = ui.team === -1 && S.phase === 'deploy' ? '' : 'none';
  }

  // ------------------------------------------------------------------ camera
  const cv = $('#gl');
  ui.fitCamera = function () {
    const w = cv.clientWidth, h = cv.clientHeight;
    const z = Math.min(w / S.W, (h - 40) / S.H) * 0.98;
    G.cam.zoom = z;
    G.cam.x = S.W / 2 - w / z / 2;
    G.cam.y = S.H / 2 - h / z / 2 + 20 / z;
  };
  function screenToWorld(sx, sy) { return [G.cam.x + sx / G.cam.zoom, G.cam.y + sy / G.cam.zoom]; }
  function zoomAt(sx, sy, f) {
    const [wx, wy] = screenToWorld(sx, sy);
    const minZ = Math.min(cv.clientWidth / S.W, cv.clientHeight / S.H) * 0.5;
    G.cam.zoom = Math.max(minZ, Math.min(12, G.cam.zoom * f));
    G.cam.x = wx - sx / G.cam.zoom; G.cam.y = wy - sy / G.cam.zoom;
  }

  // ------------------------------------------------------------------ painting
  let occ = null, OW = 0, OH = 0;
  const OC = 4;
  function buildOcc() {
    OW = Math.ceil(S.W / OC); OH = Math.ceil(S.H / OC);
    if (!occ || occ.length !== OW * OH) occ = new Uint8Array(OW * OH); else occ.fill(0);
    for (let i = 0; i < S.hw; i++) if (S.alive[i]) markOcc(S.x[i], S.y[i], G.UR[S.type[i]]);
  }
  function markOcc(x, y, r) {
    const x0 = Math.max(0, ((x - r) / OC) | 0), x1 = Math.min(OW - 1, ((x + r) / OC) | 0);
    const y0 = Math.max(0, ((y - r) / OC) | 0), y1 = Math.min(OH - 1, ((y + r) / OC) | 0);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const cx = xx * OC + 2 - x, cy = yy * OC + 2 - y;
      if (cx * cx + cy * cy <= r * r) occ[yy * OW + xx] = 1;
    }
  }
  function freeOcc(x, y, r) {
    const x0 = Math.max(0, ((x - r) / OC) | 0), x1 = Math.min(OW - 1, ((x + r) / OC) | 0);
    const y0 = Math.max(0, ((y - r) / OC) | 0), y1 = Math.min(OH - 1, ((y + r) / OC) | 0);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const cx = xx * OC + 2 - x, cy = yy * OC + 2 - y;
      if (cx * cx + cy * cy <= r * r && occ[yy * OW + xx]) return false;
    }
    return true;
  }
  function teamFor(x) { return ui.team === -1 ? (x < S.W / 2 ? 0 : 1) : ui.team; }

  let lastBuild = null;
  function stamp(wx, wy, first) {
    const tool = ui.tool, rb = ui.brush;
    if (tool.kind === 'unit') {
      const t = tool.id, u = G.UNITS[t], r = G.UR[t];
      if (u.cat === 'build' && !(u.flags & F.NEUTRAL)) {
        if (!first && lastBuild && Math.hypot(wx - lastBuild[0], wy - lastBuild[1]) < r * 2 + 6) return;
        if (!freeOcc(wx, wy, r + 2) || S.blockedAt(wx, wy)) return;
        S.spawn(t, teamFor(wx), wx, wy);
        markOcc(wx, wy, r + 2);
        lastBuild = [wx, wy];
        return;
      }
      const sp = r * 2 * (u.flags & F.NEUTRAL ? 3 : 1.06) / Math.sqrt(ui.density);
      const rowH = sp * 0.866;
      const y0 = Math.floor((wy - rb) / rowH), y1 = Math.ceil((wy + rb) / rowH);
      for (let row = y0; row <= y1; row++) {
        const yy = row * rowH;
        const off = row & 1 ? sp / 2 : 0;
        const x0 = Math.floor((wx - rb - off) / sp), x1 = Math.ceil((wx + rb - off) / sp);
        for (let col = x0; col <= x1; col++) {
          const xx = col * sp + off;
          if ((xx - wx) ** 2 + (yy - wy) ** 2 > rb * rb) continue;
          if (xx < 3 || yy < 3 || xx > S.W - 3 || yy > S.H - 3) continue;
          if (!freeOcc(xx, yy, r * 0.95) || S.blockedAt(xx, yy)) continue;
          if (S.spawn(t, teamFor(xx), xx, yy) < 0) return;
          markOcc(xx, yy, r * 0.95);
        }
      }
    } else if (tool.kind === 'terrain') {
      let r = rb;
      if (tool.id === T.WALL || tool.id === T.PALI) r = Math.max(7, Math.min(rb, 24));
      S.paintTerrain(wx, wy, r, tool.id);
    } else if (tool.kind === 'grass') S.paintTerrain(wx, wy, rb, T.GRASS);
    else if (tool.kind === 'erase') { S.eraseAt(wx, wy, rb); S.paintTerrain(wx, wy, rb, T.GRASS); dirtyOcc = true; }
    else if (tool.kind === 'eraseUnits') { S.eraseAt(wx, wy, rb); dirtyOcc = true; }
    else if (tool.kind === 'fire') S.igniteAt(wx, wy, rb);
  }
  let dirtyOcc = false;
  function strokeTo(wx, wy) {
    const [lx, ly] = lastPaint;
    const d = Math.hypot(wx - lx, wy - ly);
    const step = Math.max(2, ui.brush * 0.45);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) stamp(lx + (wx - lx) * k / n, ly + (wy - ly) * k / n, false);
    lastPaint = [wx, wy];
  }

  // ------------------------------------------------------------------ pointer input
  let painting = false, panning = false, lastPaint = null, panStart = null;
  const pointers = new Map();
  let pinch = null;
  let mouse = [0, 0, false];
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pointers.size === 2) {
      painting = false;
      const p = [...pointers.values()];
      pinch = { d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), cx: (p[0][0] + p[1][0]) / 2, cy: (p[0][1] + p[1][1]) / 2 };
      return;
    }
    if (e.button === 1 || e.button === 2 || spaceDown) {
      if (spaceDown) spaceUsedForPan = true;
      panning = true; panStart = [e.offsetX, e.offsetY, G.cam.x, G.cam.y];
      return;
    }
    if (e.button === 0) {
      painting = true;
      buildOcc();
      const [wx, wy] = screenToWorld(e.offsetX, e.offsetY);
      lastPaint = [wx, wy]; lastBuild = null;
      stamp(wx, wy, true);
    }
  });
  cv.addEventListener('pointermove', (e) => {
    mouse = [e.offsetX, e.offsetY, true];
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pinch && pointers.size === 2) {
      const p = [...pointers.values()];
      const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      const cx = (p[0][0] + p[1][0]) / 2, cy = (p[0][1] + p[1][1]) / 2;
      G.cam.x -= (cx - pinch.cx) / G.cam.zoom; G.cam.y -= (cy - pinch.cy) / G.cam.zoom;
      zoomAt(cx, cy, d / pinch.d);
      pinch = { d, cx, cy };
      return;
    }
    if (panning) {
      G.cam.x = panStart[2] - (e.offsetX - panStart[0]) / G.cam.zoom;
      G.cam.y = panStart[3] - (e.offsetY - panStart[1]) / G.cam.zoom;
      return;
    }
    if (painting) {
      if (dirtyOcc) { buildOcc(); dirtyOcc = false; }
      const [wx, wy] = screenToWorld(e.offsetX, e.offsetY);
      strokeTo(wx, wy);
    }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) { painting = false; panning = false; }
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('pointerleave', () => { mouse[2] = false; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  let spaceDown = false;
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { spaceDown = true; spaceUsedForPan = false; } return; }
    if (e.key === 'Enter') { toggleRun(); }
    else if (e.key === 'c' || e.key === 'C') clearAll();
    else if (e.key === 'r' || e.key === 'R') replay();
    else if (e.key === '[') setBrush(ui.brush / 1.25);
    else if (e.key === ']') setBrush(ui.brush * 1.25);
    else if (e.key === 'f' || e.key === 'F') ui.fitCamera();
    else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('hideui');
    else if (e.key >= '0' && e.key <= '4') { ui.team = e.key === '0' ? -1 : +e.key - 1; renderTeams(); renderTools(); updateLabels(); }
  });
  let spaceUsedForPan = false;
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceDown = false; if (!panning && !spaceUsedForPan) toggleRun(); }
  });

  // ------------------------------------------------------------------ controls
  function setBrush(v) {
    ui.brush = Math.max(3, Math.min(400, v));
    $('#brush').value = Math.round(Math.sqrt(ui.brush) * 10);
    $('#brushv').textContent = Math.round(ui.brush);
  }
  $('#brush').addEventListener('input', (e) => { ui.brush = (e.target.value / 10) ** 2; $('#brushv').textContent = Math.round(ui.brush); });
  $('#density').addEventListener('input', (e) => { ui.density = e.target.value / 100; $('#densv').textContent = e.target.value + '%'; });

  function toggleRun() {
    if (S.phase === 'deploy') {
      if (S.count === 0) { toast('Peins d\'abord des unités sur le terrain !'); return; }
      ui.snapshot = S.snapshot();
      S.startBattle();
      ui.running = true;
    } else ui.running = !ui.running;
    hideBanner();
    updateButtons();
  }
  function replay() {
    if (!ui.snapshot) return;
    S.restore(ui.snapshot);
    G.R.clearDecals();
    ui.running = false;
    hideBanner();
    updateButtons();
  }
  function clearAll() {
    S.clearAll();
    G.R.clearDecals();
    ui.snapshot = null; ui.running = false;
    hideBanner();
    updateButtons();
  }
  ui.clearAll = clearAll;
  function updateButtons() {
    const b = $('#start');
    if (S.phase === 'deploy') { b.textContent = '▶ Lancer'; b.className = 'big go'; }
    else if (ui.running) { b.textContent = '❚❚ Pause'; b.className = 'big pause'; }
    else { b.textContent = '▶ Reprendre'; b.className = 'big go'; }
    $('#replay').disabled = !ui.snapshot;
    updateLabels();
  }
  $('#start').onclick = toggleRun;
  $('#replay').onclick = replay;
  $('#clear').onclick = clearAll;
  $('#fit').onclick = () => ui.fitCamera();
  document.querySelectorAll('#speed button').forEach((b) => {
    b.onclick = () => {
      ui.speed = +b.dataset.s;
      document.querySelectorAll('#speed button').forEach((o) => o.classList.toggle('on', o === b));
    };
  });
  $('#optBars').onchange = (e) => (ui.opts.bars = e.target.checked);
  $('#optFF').onchange = (e) => (S.friendlyFire = e.target.checked);
  $('#optWind').oninput = (e) => (S.wind = e.target.value / 100);
  $('#mapSize').onchange = (e) => setSize(e.target.value);

  function setSize(sz) {
    ui.size = sz;
    $('#mapSize').value = sz;
    const [w, h] = SIZES[sz];
    G.initWorld(w, h);
    G.R.initWorld();
    ui.snapshot = null; ui.running = false;
    ui.fitCamera();
    hideBanner();
    updateButtons();
  }
  ui.setSize = setSize;

  // scenarios
  const sel = $('#scen');
  G.SCENARIOS.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s.name; sel.appendChild(o); });
  sel.onchange = () => {
    const sc = G.SCENARIOS[+sel.value];
    sel.value = '';
    if (!sc) return;
    setSize(sc.size);
    const t0 = performance.now();
    sc.run();
    S.buildGrid();
    toast(`${sc.name} — ${S.count.toLocaleString('fr-FR')} unités (${Math.round(performance.now() - t0)} ms). Appuie sur Lancer !`);
  };

  // ------------------------------------------------------------------ HUD
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 3200);
  }
  ui.toast = toast;
  function hideBanner() { $('#banner').classList.remove('show'); bannerShown = false; }
  let bannerShown = false;
  function showBanner() {
    const w = S.winner;
    const b = $('#banner');
    if (w >= 0) {
      b.querySelector('h2').textContent = `Victoire de l'équipe ${G.TEAM_NAMES[w]} !`;
      b.querySelector('h2').style.color = `rgb(${G.TEAM_RGB[w]})`;
    } else { b.querySelector('h2').textContent = 'Match nul : plus personne debout !'; b.querySelector('h2').style.color = '#333'; }
    const secs = Math.round(S.time);
    b.querySelector('p').textContent = `${S.teamCount[w] || 0} survivants · ${secs} s de combat · ${S.kills.reduce((a, c) => a + c, 0).toLocaleString('fr-FR')} éliminations`;
    b.classList.add('show');
    bannerShown = true;
  }
  $('#bReplay').onclick = replay;
  $('#bClose').onclick = hideBanner;

  const fpsHist = [];
  let lastHud = 0;
  ui.update = function (now, frameMs, simMs) {
    fpsHist.push(frameMs);
    if (fpsHist.length > 30) fpsHist.shift();
    // brush preview
    if (mouse[2] && !panning) {
      const [wx, wy] = screenToWorld(mouse[0], mouse[1]);
      let r = ui.brush;
      const tool = ui.tool;
      if (tool.kind === 'unit' && G.UNITS[tool.id].cat === 'build' && !(G.UNITS[tool.id].flags & F.NEUTRAL)) r = G.UR[tool.id];
      if (tool.kind === 'terrain' && (tool.id === T.WALL || tool.id === T.PALI)) r = Math.max(7, Math.min(r, 24));
      const tm = teamFor(wx);
      const c = tool.kind === 'unit' ? G.TEAM_RGB[G.UNITS[tool.id].flags & F.NEUTRAL ? 4 : tm] : tool.kind === 'fire' ? [255, 140, 30] : [255, 255, 255];
      ui.brushPreview = { x: wx, y: wy, r, col: G.R.rgba(c[0], c[1], c[2], 200) };
    } else ui.brushPreview = null;

    if (S.events.length) {
      for (const ev of S.events.splice(0)) {
        if (ev.kind === 'king') toast(`👑 Le roi ${G.TEAM_NAMES[ev.team].toLowerCase()} est tombé ! Son armée panique !`);
      }
    }
    if (S.winner !== -2 && !bannerShown && S.phase === 'battle') { showBanner(); }

    if (now - lastHud < 250) return;
    lastHud = now;
    const avg = fpsHist.reduce((a, b) => a + b, 0) / fpsHist.length;
    let h = '';
    let total = 0;
    for (let k = 0; k < 5; k++) total += S.teamCount[k];
    for (let k = 0; k < 4; k++) {
      const n = S.teamCount[k];
      if (!n && !(S.kills[k])) continue;
      const pct = total ? (n / total) * 100 : 0;
      const st = S.stance[k] === 1;
      h += `<div class="tm"><i style="background:rgb(${G.TEAM_RGB[k]})"></i><b>${G.TEAM_NAMES[k]} <button class="stance${st ? ' hold' : ''}" data-t="${k}" title="Posture de l'équipe (clic pour changer)">${st ? '🛡 Défense' : '⚔ Attaque'}</button></b><span>${n.toLocaleString('fr-FR')}</span><div class="bar"><div style="width:${pct}%;background:rgb(${G.TEAM_RGB[k]})"></div></div></div>`;
    }
    $('#teamsHud').innerHTML = h || '<div class="hint">Aucune unité</div>';
    $('#perf').textContent = `${Math.round(1000 / avg)} FPS · sim ${simMs.toFixed(1)} ms · ${S.count.toLocaleString('fr-FR')} unités · ${S.nproj.toLocaleString('fr-FR')} projectiles · ${G.R.nfx().toLocaleString('fr-FR')} particules`;
    $('#clock').textContent = S.phase === 'battle' ? `${Math.floor(S.time / 60)}:${String(Math.floor(S.time % 60)).padStart(2, '0')}` : 'Déploiement';
  };

  $('#teamsHud').addEventListener('click', (e) => {
    const b = e.target.closest('.stance');
    if (!b) return;
    const k = +b.dataset.t;
    S.stance[k] = S.stance[k] ? 0 : 1;
    lastHud = 0;
    toast(`Équipe ${G.TEAM_NAMES[k]} : ${S.stance[k] ? 'en défense, tient sa position' : 'à l\'attaque !'}`);
  });

  // in-world drag on toolbars should not paint
  ui.init = function () {
    renderTabs(); renderTools(); renderTeams();
    setBrush(ui.brush);
    updateButtons();
  };
})();
