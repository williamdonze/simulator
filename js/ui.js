'use strict';
// ============================================================================
//  Minimal UI: pick a unit, drag on the field, press Lancer.
//  Wheel / pinch = brush size. Stats only on demand at the end.
// ============================================================================
(function () {
  const S = G.S, F = G.F, T = G.T;
  const $ = (s) => document.querySelector(s);
  const ui = (G.ui = {
    opts: { bars: false },
    tool: { kind: 'unit', id: G.U.rifle },
    brush: 26,
    running: false,
    speed: 1,
    snapshot: null,
    brushPreview: null,
    showMid: () => true,
  });

  // ------------------------------------------------------------------ tabs
  const TABS = [
    { name: 'Infanterie', items: ['rifle', 'mg', 'sniper', 'rpg', 'grenadier', 'flamer', 'medic', 'officer', 'riot', 'commando', 'sapper'] },
    { name: 'Véhicules', items: ['jeep', 'apc', 'tank', 'artillery', 'mlrs', 'aa'] },
    { name: 'Aérien', items: ['fpv', 'bomber', 'heli', 'jet'] },
    { name: 'Bâtiments', items: ['barracks', 'factory', 'helipad', 'dronebase', 'hospital', 'hq', 'bunker', 'turret', 'sam', 'mine', 'fuel'] },
    { name: 'Terrain', terrain: ['FOREST', 'TALL', 'WATER', 'DEEP', 'MUD', 'SAND', 'ROAD', 'ROCK', 'WALL', 'PALI', 'SPIKES'], tools: ['fire', 'erase'] },
  ];
  const TOOLS = { erase: 'Gomme', fire: 'Feu' };
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
    x.fillStyle = `rgb(${col})`; x.strokeStyle = '#2b2433'; x.lineWidth = 5;
    x.beginPath(); x.roundRect(14, 14, 68, 68, 20); x.fill(); x.stroke();
    const fr = { FOREST: 'tree0', ROCK: 'rock0', WALL: 'wall', PALI: 'pali', SPIKES: 'spikes' }[k];
    if (fr) {
      const f = G.frames[G.FR[fr]];
      const s = Math.min(54 / f.w, 54 / f.h);
      x.drawImage(G.atlasBase, f.x, f.y, f.w, f.h, 48 - f.w * s / 2, 50 - f.h * s / 2, f.w * s, f.h * s);
    }
    if (k === 'WATER' || k === 'DEEP') { x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 5; x.beginPath(); x.moveTo(28, 50); x.quadraticCurveTo(38, 42, 48, 50); x.quadraticCurveTo(58, 58, 68, 50); x.stroke(); }
    return c.toDataURL();
  }
  function toolIcon(k) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d');
    x.font = '56px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(k === 'fire' ? '🔥' : '🧽', 48, 54);
    return c.toDataURL();
  }

  const nameEl = $('#name');
  function showName(txt, el) {
    nameEl.textContent = txt;
    const r = el.getBoundingClientRect();
    nameEl.classList.add('show');
    nameEl.style.left = Math.max(4, r.left + r.width / 2 - nameEl.offsetWidth / 2) + 'px';
    nameEl.style.top = r.top - 34 + 'px';
  }
  function hideName() { nameEl.classList.remove('show'); }

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
    const add = (label, icon, active, onclick) => {
      const b = document.createElement('button');
      b.className = 'tool' + (active ? ' on' : '');
      b.setAttribute('aria-label', label);
      b.innerHTML = `<img src="${icon}" alt="">`;
      b.onclick = () => { onclick(); renderTools(); };
      b.onmouseenter = () => showName(label, b);
      b.onmouseleave = hideName;
      row.appendChild(b);
    };
    for (const k of tab.items || []) {
      const id = G.U[k], u = G.UNITS[id];
      add(u.name, unitIcon(id, u.flags & F.NEUTRAL ? 4 : 1), ui.tool.kind === 'unit' && ui.tool.id === id, () => (ui.tool = { kind: 'unit', id }));
    }
    for (const k of tab.terrain || []) {
      const tt = T[k];
      add(G.TERRAIN[tt].name, terrainIcon(k), ui.tool.kind === 'terrain' && ui.tool.id === tt, () => (ui.tool = { kind: 'terrain', id: tt }));
    }
    for (const k of tab.tools || []) add(TOOLS[k], toolIcon(k), ui.tool.kind === k, () => (ui.tool = { kind: k }));
  }

  // ------------------------------------------------------------------ camera: the whole field always fits the screen
  const cv = $('#gl');
  ui.worldForScreen = function () {
    const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
    const z = Math.max(0.75, Math.min(1.7, w / 1100));
    return [Math.round(w / z / 8) * 8, Math.round(h / z / 8) * 8];
  };
  ui.fitCamera = function () {
    const w = cv.clientWidth, h = cv.clientHeight;
    const z = Math.min(w / S.W, h / S.H);
    G.cam.zoom = z;
    G.cam.x = S.W / 2 - w / z / 2;
    G.cam.y = S.H / 2 - h / z / 2;
  };
  window.addEventListener('resize', () => ui.fitCamera());
  const toWorld = (sx, sy) => [G.cam.x + sx / G.cam.zoom, G.cam.y + sy / G.cam.zoom];

  // ------------------------------------------------------------------ painting
  let occ = null, OW = 0, OH = 0;
  const OC = 4;
  function buildOcc() {
    OW = Math.ceil(S.W / OC); OH = Math.ceil(S.H / OC);
    if (!occ || occ.length !== OW * OH) occ = new Uint8Array(OW * OH); else occ.fill(0);
    for (let i = 0; i < S.hw; i++) if (S.alive[i]) markOcc(S.x[i], S.y[i], G.UR[S.type[i]]);
  }
  function cells(x, y, r, fn) {
    const x0 = Math.max(0, ((x - r) / OC) | 0), x1 = Math.min(OW - 1, ((x + r) / OC) | 0);
    const y0 = Math.max(0, ((y - r) / OC) | 0), y1 = Math.min(OH - 1, ((y + r) / OC) | 0);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const cx = xx * OC + 2 - x, cy = yy * OC + 2 - y;
      if (cx * cx + cy * cy <= r * r && fn(yy * OW + xx) === false) return false;
    }
    return true;
  }
  const markOcc = (x, y, r) => cells(x, y, r, (k) => { occ[k] = 1; });
  const freeOcc = (x, y, r) => cells(x, y, r, (k) => (occ[k] ? false : undefined));
  const teamFor = (x) => (x < S.W / 2 ? 0 : 1);

  let lastBuild = null;
  function stamp(wx, wy, first) {
    const tool = ui.tool, rb = ui.brush;
    if (tool.kind === 'unit') {
      const t = tool.id, u = G.UNITS[t], r = G.UR[t];
      if (u.cat === 'build' && !(u.flags & (F.NEUTRAL | F.MINE))) {
        if (!first && lastBuild && Math.hypot(wx - lastBuild[0], wy - lastBuild[1]) < r * 2 + 6) return;
        if (!freeOcc(wx, wy, r + 2) || S.blockedAt(wx, wy)) return;
        S.spawn(t, teamFor(wx), wx, wy);
        markOcc(wx, wy, r + 2);
        lastBuild = [wx, wy];
        return;
      }
      const sp = r * 2 * (u.flags & F.NEUTRAL ? 3 : u.flags & F.MINE ? 4 : u.flags & F.AIR ? 1.5 : 1.06);
      const rowH = sp * 0.866;
      for (let row = Math.floor((wy - rb) / rowH); row <= Math.ceil((wy + rb) / rowH); row++) {
        const yy = row * rowH, off = row & 1 ? sp / 2 : 0;
        for (let col = Math.floor((wx - rb - off) / sp); col <= Math.ceil((wx + rb - off) / sp); col++) {
          const xx = col * sp + off;
          if ((xx - wx) ** 2 + (yy - wy) ** 2 > rb * rb) continue;
          if (xx < 3 || yy < 3 || xx > S.W - 3 || yy > S.H - 3) continue;
          if (!freeOcc(xx, yy, r * 0.95) || (!(u.flags & F.AIR) && S.blockedAt(xx, yy))) continue;
          if (S.spawn(t, teamFor(xx), xx, yy) < 0) return;
          markOcc(xx, yy, r * 0.95);
        }
      }
    } else if (tool.kind === 'terrain') {
      let r = rb;
      if (tool.id === T.WALL || tool.id === T.PALI) r = Math.max(7, Math.min(rb, 20));
      S.paintTerrain(wx, wy, r, tool.id);
    } else if (tool.kind === 'erase') { S.eraseAt(wx, wy, rb); S.paintTerrain(wx, wy, rb, T.GRASS); buildOcc(); }
    else if (tool.kind === 'fire') S.igniteAt(wx, wy, rb);
  }
  let lastPaint = null;
  function strokeTo(wx, wy) {
    const [lx, ly] = lastPaint;
    const n = Math.max(1, Math.ceil(Math.hypot(wx - lx, wy - ly) / Math.max(2, ui.brush * 0.45)));
    for (let k = 1; k <= n; k++) stamp(lx + (wx - lx) * k / n, ly + (wy - ly) * k / n, false);
    lastPaint = [wx, wy];
  }

  // ------------------------------------------------------------------ input
  let painting = false, pinch = null;
  const pointers = new Map();
  let mouse = [0, 0, false];
  const setBrush = (v) => { ui.brush = Math.max(4, Math.min(220, v)); };
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    mouse = [e.offsetX, e.offsetY, e.pointerType === 'mouse'];
    if (pointers.size === 2) {
      painting = false;
      const p = [...pointers.values()];
      pinch = { d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), b: ui.brush };
      return;
    }
    if (e.button !== 0) return;
    painting = true;
    buildOcc();
    const [wx, wy] = toWorld(e.offsetX, e.offsetY);
    lastPaint = [wx, wy]; lastBuild = null;
    stamp(wx, wy, true);
  });
  cv.addEventListener('pointermove', (e) => {
    mouse = [e.offsetX, e.offsetY, e.pointerType === 'mouse' || painting];
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pinch && pointers.size === 2) {
      const p = [...pointers.values()];
      setBrush(pinch.b * Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) / pinch.d);
      return;
    }
    if (painting) strokeTo(...toWorld(e.offsetX, e.offsetY));
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) { painting = false; if (e.pointerType !== 'mouse') mouse[2] = false; }
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('pointerleave', () => { if (!painting) mouse[2] = false; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); setBrush(ui.brush * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) (S.phase === 'deploy' ? start() : e.code === 'Space' ? (ui.running = !ui.running) : reset()); }
    else if (e.key === 'c' || e.key === 'C') clearAll();
    else if (e.key === '[') setBrush(ui.brush / 1.25);
    else if (e.key === ']') setBrush(ui.brush * 1.25);
  });

  // ------------------------------------------------------------------ battle flow
  function start() {
    if (S.count === 0) return;
    ui.snapshot = S.snapshot();
    S.startBattle();
    ui.running = true;
    update();
  }
  function reset() {
    if (ui.snapshot) S.restore(ui.snapshot);
    G.R.clearDecals();
    ui.running = false;
    update();
  }
  function clearAll() {
    const [w, h] = ui.worldForScreen();
    if (w !== S.W || h !== S.H) { G.initWorld(w, h); G.R.initWorld(); ui.fitCamera(); }
    else S.clearAll();
    G.R.clearDecals();
    ui.snapshot = null; ui.running = false;
    update();
  }
  ui.clearAll = clearAll;
  function update() {
    const battle = S.phase === 'battle';
    document.body.classList.toggle('battle', battle);
    const b = $('#start');
    b.textContent = battle ? 'Rejouer' : 'Lancer';
    b.classList.toggle('reset', battle);
    $('#end').classList.remove('show');
    $('#stats').classList.remove('show');
    endShown = false;
  }
  $('#start').onclick = () => (S.phase === 'deploy' ? start() : reset());
  $('#clear').onclick = clearAll;

  // ------------------------------------------------------------------ end of battle & stats
  let endShown = false;
  function showEnd() {
    endShown = true;
    const w = S.winner;
    const t = $('#endTxt');
    t.textContent = w >= 0 ? `Victoire ${['rouge', 'bleue', 'verte', 'jaune'][w]} !` : 'Égalité !';
    t.style.color = w >= 0 ? `rgb(${G.TEAM_RGB[w]})` : '';
    $('#end').classList.add('show');
  }
  $('#seeStats').onclick = () => { renderStats(); $('#stats').classList.add('show'); };
  $('#stats').addEventListener('click', (e) => { if (e.target.id === 'stats' || e.target.id === 'close') $('#stats').classList.remove('show'); });

  function renderStats() {
    const st = S.stat, NU = G.UNITS.length;
    const teams = [0, 1, 2, 3].filter((k) => { for (let t = 0; t < NU; t++) if (st.deployed[t * 4 + k]) return true; return false; });
    const tName = (k) => ['Rouges', 'Bleus', 'Verts', 'Jaunes'][k];
    const secs = Math.round(S.time);
    let h = `<h2 style="color:${S.winner >= 0 ? `rgb(${G.TEAM_RGB[S.winner]})` : 'inherit'}">${$('#endTxt').textContent}</h2>`;
    h += `<div class="sub">Combat de ${Math.floor(secs / 60)} min ${secs % 60} s</div><div class="cols">`;
    for (const k of teams) {
      let dep = 0, lost = 0, kills = 0, best = -1, bestK = 0;
      for (let t = 0; t < NU; t++) {
        dep += st.deployed[t * 4 + k]; lost += st.lost[t * 4 + k]; kills += st.kills[t * 4 + k];
        if (st.kills[t * 4 + k] > bestK) { bestK = st.kills[t * 4 + k]; best = t; }
      }
      h += `<div class="side"><h3 style="color:rgb(${G.TEAM_RGB[k]})">${tName(k)}</h3>`;
      h += `<div class="kv">Engagés<b>${dep.toLocaleString('fr-FR')}</b></div>`;
      h += `<div class="kv">Survivants<b>${S.teamCount[k].toLocaleString('fr-FR')}</b></div>`;
      h += `<div class="kv">Pertes<b>${lost.toLocaleString('fr-FR')}</b></div>`;
      h += `<div class="kv">Éliminations<b>${kills.toLocaleString('fr-FR')}</b></div>`;
      if (best >= 0) h += `<div class="mvp"><img src="${unitIcon(best, k)}" alt=""><div><small>Meilleure unité</small>${G.UNITS[best].name} · ${bestK} élim.</div></div>`;
      h += '</div>';
    }
    h += '</div>';
    // per unit-type table (two main teams)
    const a = teams[0], b = teams[1];
    const rows = [];
    for (let t = 0; t < NU; t++) {
      const anyA = a != null && st.deployed[t * 4 + a], anyB = b != null && st.deployed[t * 4 + b];
      if (anyA || anyB) rows.push(t);
    }
    rows.sort((p, q) => (st.kills[q * 4 + a] + (b != null ? st.kills[q * 4 + b] : 0)) - (st.kills[p * 4 + a] + (b != null ? st.kills[p * 4 + b] : 0)));
    h += `<table><tr><th>Unité</th><th class="r">Engagés</th><th class="r">Pertes</th><th class="r">Élim.</th>${b != null ? '<th class="b">Engagés</th><th class="b">Pertes</th><th class="b">Élim.</th>' : ''}</tr>`;
    for (const t of rows) {
      const c = (k, f) => (k == null ? '' : `<td>${st[f][t * 4 + k] || '–'}</td>`);
      h += `<tr><td><img src="${unitIcon(t, 1)}" alt="">${G.UNITS[t].name}</td>${c(a, 'deployed')}${c(a, 'lost')}${c(a, 'kills')}${b != null ? c(b, 'deployed') + c(b, 'lost') + c(b, 'kills') : ''}</tr>`;
    }
    h += '</table><button id="close">Fermer</button>';
    $('#card').innerHTML = h;
  }

  // ------------------------------------------------------------------ per frame
  ui.update = function () {
    if (mouse[2]) {
      const [wx, wy] = toWorld(mouse[0], mouse[1]);
      let r = ui.brush;
      const tool = ui.tool;
      const u = tool.kind === 'unit' ? G.UNITS[tool.id] : null;
      if (u && u.cat === 'build' && !(u.flags & (F.NEUTRAL | F.MINE))) r = G.UR[tool.id];
      if (tool.kind === 'terrain' && (tool.id === T.WALL || tool.id === T.PALI)) r = Math.max(7, Math.min(r, 20));
      const c = u ? G.TEAM_RGB[u.flags & F.NEUTRAL ? 4 : teamFor(wx)] : tool.kind === 'fire' ? [255, 120, 30] : [43, 36, 51];
      ui.brushPreview = { x: wx, y: wy, r, col: G.R.rgba(c[0], c[1], c[2], 255) };
    } else ui.brushPreview = null;
    S.events.length = 0;
    if (S.phase === 'battle' && S.winner !== -2 && !endShown) showEnd();
  };

  ui.init = function () {
    renderTabs(); renderTools(); update();
  };
})();
