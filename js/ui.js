'use strict';
// ============================================================================
//  UI: paint plants & animals, watch the ecosystem live.
// ============================================================================
(function () {
  const S = G.S, F = G.F, T = G.T, U = G.U;
  const $ = (s) => document.querySelector(s);
  const ui = (G.ui = {
    tool: { kind: 'terrain', id: T.FOREST },
    brush: 28,
    running: false,
    speed: 1,
    brushPreview: null,
    selected: -1,
  });

  // ------------------------------------------------------------------ tabs
  const TABS = [
    { name: 'Plantes', terrain: ['GRASS', 'TALL', 'FLOWERS', 'BUSH', 'FOREST', 'REEDS'], items: ['hive'] },
    { name: 'Herbivores', items: ['rabbit', 'mouse', 'squirrel', 'deer', 'boar', 'bison', 'beaver'] },
    { name: 'Prédateurs', items: ['fox', 'wolf', 'lynx', 'bear'] },
    { name: 'Oiseaux', items: ['eagle', 'owl', 'vulture', 'crow', 'duck', 'heron'] },
    { name: 'Eau & insectes', terrain: ['WATER', 'DEEP'], items: ['fish', 'frog', 'butterfly'] },
    { name: 'Terrain', terrain: ['SAND', 'MUD', 'ROCK', 'DIRT'] },
    { name: 'Outils', tools: ['inspect', 'rain', 'fire', 'erase'] },
  ];
  const TOOLS = { inspect: ['Loupe', '🔍'], rain: ['Faire pleuvoir', '🌧️'], fire: ['Foudre', '⚡'], erase: ['Gomme', '🧽'] };
  let curTab = 0;

  const iconCache = {};
  function unitIcon(id) {
    if (!iconCache[id]) iconCache[id] = G.frameIcon(G.unitFramesM[id * 4], 96, [255, 255, 255]);
    return iconCache[id];
  }
  ui.unitIcon = unitIcon;
  function terrainIcon(k) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d');
    const t = G.TERRAIN[T[k]];
    x.fillStyle = `rgb(${t.lush})`; x.strokeStyle = '#2b2433'; x.lineWidth = 5;
    x.beginPath(); x.roundRect(14, 14, 68, 68, 20); x.fill(); x.stroke();
    const fr = { FOREST: ['tree0', 54], BUSH: ['bushB', 46], FLOWERS: ['flower0', 30], TALL: ['tuft', 40], REEDS: ['reed', 46], ROCK: ['rock0', 50] }[k];
    const draw = (name, size, dx, dy) => { const f = G.frames[G.FR[name]]; const s = Math.min(size / f.w, size / f.h); x.drawImage(G.atlasBase, f.x, f.y, f.w, f.h, dx - f.w * s / 2, dy - f.h * s / 2, f.w * s, f.h * s); };
    if (fr) {
      if (k === 'FLOWERS') { draw('flower0', 26, 36, 42); draw('flower1', 26, 58, 52); draw('flower3', 24, 44, 62); }
      else draw(fr[0], fr[1], 48, 50);
    }
    if (k === 'WATER' || k === 'DEEP') { x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 5; x.beginPath(); x.moveTo(28, 50); x.quadraticCurveTo(38, 42, 48, 50); x.quadraticCurveTo(58, 58, 68, 50); x.stroke(); }
    return c.toDataURL();
  }
  function emojiIcon(e) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d');
    x.font = '56px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(e, 48, 54);
    return c.toDataURL();
  }

  const nameEl = $('#name');
  function showName(txt, el) {
    nameEl.textContent = txt;
    const r = el.getBoundingClientRect();
    nameEl.classList.add('show');
    nameEl.style.left = Math.max(4, Math.min(innerWidth - nameEl.offsetWidth - 4, r.left + r.width / 2 - nameEl.offsetWidth / 2)) + 'px';
    nameEl.style.top = r.top - nameEl.offsetHeight - 8 + 'px';
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
    const add = (label, desc, icon, active, onclick) => {
      const b = document.createElement('button');
      b.className = 'tool' + (active ? ' on' : '');
      b.setAttribute('aria-label', label);
      b.innerHTML = `<img src="${icon}" alt="">`;
      b.onclick = () => { onclick(); renderTools(); };
      b.onmouseenter = () => showName(desc ? `${label} — ${desc}` : label, b);
      b.onmouseleave = hideName;
      row.appendChild(b);
    };
    for (const k of tab.terrain || []) {
      const tt = T[k];
      add(G.TERRAIN[tt].name, G.TERRAIN[tt].desc, terrainIcon(k), ui.tool.kind === 'terrain' && ui.tool.id === tt, () => (ui.tool = { kind: 'terrain', id: tt }));
    }
    for (const k of tab.items || []) {
      const id = U[k], u = G.UNITS[id];
      add(u.name, u.desc, unitIcon(id), ui.tool.kind === 'unit' && ui.tool.id === id, () => (ui.tool = { kind: 'unit', id }));
    }
    for (const k of tab.tools || []) add(TOOLS[k][0], '', emojiIcon(TOOLS[k][1]), ui.tool.kind === k, () => {
      if (k === 'rain') { S.makeRain(); toast(S.season() === 3 ? '❄️ Il neige…' : '🌧️ Il pleut : l\'herbe pousse deux fois plus vite.'); return; }
      ui.tool = { kind: k };
    });
  }

  // ------------------------------------------------------------------ camera
  const cv = $('#gl');
  // pixel scale: each game pixel is PX screen pixels; the world is the screen divided by it
  ui.worldForScreen = function () {
    const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
    G.PX = Math.max(2, Math.min(4, Math.round(w / 640)));
    return [Math.floor(w / G.PX), Math.floor(h / G.PX)];
  };
  ui.fitCamera = function () {
    G.cam.zoom = G.PX || 2;
    G.cam.x = 0; G.cam.y = 0;
  };
  window.addEventListener('resize', () => ui.fitCamera());
  const toWorld = (sx, sy) => [G.cam.x + sx / G.cam.zoom, G.cam.y + sy / G.cam.zoom];

  // ------------------------------------------------------------------ painting
  let lastSpawn = 0;
  function stamp(wx, wy, first) {
    const tool = ui.tool, rb = ui.brush;
    if (tool.kind === 'terrain') { S.paintTerrain(wx, wy, rb, tool.id); return; }
    if (tool.kind === 'erase') { S.eraseAt(wx, wy, rb); S.paintTerrain(wx, wy, rb, T.GRASS); return; }
    if (tool.kind === 'fire') { S.igniteAt(wx, wy, Math.min(rb, 16)); G.fx.sparkle(wx, wy, 6); return; }
    if (tool.kind === 'inspect') { if (first) { ui.selected = S.pick(wx, wy); renderCard(); } return; }
    if (tool.kind !== 'unit') return;
    const t = tool.id, u = G.UNITS[t];
    if (u.flags & F.HIVE) { if (first && S.okAt(t, wx, wy)) S.spawn(t, wx, wy); return; }
    // scatter a few individuals in the brush (animals are not soldiers in rows)
    const now = performance.now();
    if (!first && now - lastSpawn < 70) return;
    lastSpawn = now;
    const n = Math.max(1, Math.round(rb * rb / (u.r * u.r * 60)));
    for (let k = 0; k < Math.min(n, 12); k++) {
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * rb;
      const x = wx + Math.cos(a) * d, y = wy + Math.sin(a) * d;
      if (S.okAt(t, x, y)) S.spawn(t, x, y);
    }
  }
  let lastPaint = null;
  function strokeTo(wx, wy) {
    const [lx, ly] = lastPaint;
    const n = Math.max(1, Math.ceil(Math.hypot(wx - lx, wy - ly) / Math.max(2, ui.brush * 0.45)));
    for (let k = 1; k <= n; k++) stamp(lx + (wx - lx) * k / n, ly + (wy - ly) * k / n, false);
    lastPaint = [wx, wy];
  }

  let painting = false, pinch = null;
  const pointers = new Map();
  let mouse = [0, 0, false];
  const setBrush = (v) => { ui.brush = Math.max(4, Math.min(160, v)); };
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
    const [wx, wy] = toWorld(e.offsetX, e.offsetY);
    lastPaint = [wx, wy];
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

  // ------------------------------------------------------------------ play / speed
  function setRunning(r) { ui.running = r; update(); }
  function update() {
    const b = $('#start');
    b.textContent = ui.running ? '❚❚ Pause' : '▶ Lancer la vie';
    b.classList.toggle('pause', ui.running);
    document.querySelectorAll('#speed button').forEach((o) => o.classList.toggle('on', +o.dataset.s === ui.speed));
  }
  $('#start').onclick = () => setRunning(!ui.running);
  document.querySelectorAll('#speed button').forEach((b) => (b.onclick = () => { ui.speed = +b.dataset.s; if (!ui.running) ui.running = true; update(); }));
  $('#clear').onclick = () => {
    const [w, h] = ui.worldForScreen();
    if (w !== S.W || h !== S.H) { G.initWorld(w, h); G.R.initWorld(); ui.fitCamera(); } else S.clearAll();
    G.R.clearDecals(); ui.selected = -1; renderCard(); setRunning(false);
  };
  $('#demo').onclick = () => { G.demo(); setRunning(true); };

  // ------------------------------------------------------------------ toasts
  const queue = [];
  let toastBusy = false;
  function toast(msg) { queue.push(msg); if (!toastBusy) nextToast(); }
  ui.toast = toast;
  function nextToast() {
    const t = $('#toast');
    if (!queue.length) { toastBusy = false; t.classList.remove('show'); return; }
    toastBusy = true;
    t.textContent = queue.shift();
    t.classList.add('show');
    setTimeout(() => { t.classList.remove('show'); setTimeout(nextToast, 350); }, 3800);
  }

  // ------------------------------------------------------------------ inspector card
  const STATE_ICON = ['🚶', '🌿', '👀', '💧', '💨', '🎯', '🍖', '💕', '💤', '🐾', '⚔️', '🔨', '🏠', '🫣'];
  function nameOf(i) {
    const k = G.UNITS[S.type[i]].k;
    if (S.nameI[i] % 9 === 0 && G.SPECIAL_NAMES[k]) return G.SPECIAL_NAMES[k];
    return G.NAMES[S.nameI[i] % G.NAMES.length];
  }
  function renderCard() {
    const c = $('#card');
    const i = ui.selected;
    if (i < 0 || !S.alive[i]) { c.classList.remove('show'); ui.selected = -1; return; }
    const t = S.type[i], u = G.UNITS[t];
    let h = `<div class="ch"><img src="${unitIcon(t)}" alt=""><div><b>${u.flags & F.CARCASS ? 'Carcasse' : nameOf(i)}</b><small>${u.name}${u.flags & (F.STATIC) ? '' : S.sex[i] ? ' ♂' : ' ♀'}${S.vari[i] === 1 ? ' · doré ✨' : S.vari[i] === 2 ? ' · albinos' : ''}</small></div><button id="cardX" aria-label="Fermer">✕</button></div>`;
    if (u.flags & F.CARCASS) h += `<p>Nourriture restante : ${(S.store[i]).toFixed(1)}. Elle nourrit charognards et prédateurs puis fertilise le sol.</p>`;
    else if (u.flags & F.HIVE) h += `<p>Miel : ${S.store[i].toFixed(1)}</p>`;
    else {
      const age = S.age[i];
      h += `<p class="st">${STATE_ICON[S.state[i]]} ${S.STATE_NAMES[S.state[i]]}${S.preg[i] > 0 ? ' · attend des petits' : ''}</p>`;
      const bar = (lbl, v, col) => `<div class="bar"><span>${lbl}</span><i><em style="width:${Math.max(0, Math.min(100, v * 100))}%;background:${col}"></em></i></div>`;
      h += bar('Énergie', S.en[i], '#5cb85c');
      if (u.thirst < 50) h += bar('Hydratation', S.wat[i], '#4aa8e8');
      h += bar('Santé', S.hp[i] / G.UHP[t], '#e8584a');
      h += `<div class="kv">Âge <b>${age.toFixed(1)} j</b> <span>· adulte à ${u.mature} j · vit ~${u.life} j</span></div>`;
      if (S.kids[i]) h += `<div class="kv">Petits <b>${S.kids[i]}</b></div>`;
      if (S.kills[i]) h += `<div class="kv">Proies <b>${S.kills[i]}</b></div>`;
      h += `<p class="d">${u.desc}</p>`;
      if (t === U.frog) h += '<button id="kiss">💋 Embrasser</button>';
    }
    c.innerHTML = h;
    c.classList.add('show');
    $('#cardX').onclick = () => { ui.selected = -1; renderCard(); };
    const k = $('#kiss');
    if (k) k.onclick = () => {
      if (Math.random() < 0.08) { G.fx.sparkle(S.x[i], S.y[i] - 4, 20); S.remove(i); toast('✨ C\'était un vrai prince ! Il repart vers son château.'); ui.selected = -1; renderCard(); }
      else toast('🐸 Il ne se passe rien. C\'était juste une grenouille.');
    };
  }

  // ------------------------------------------------------------------ population graph
  const GRAPH_SP = ['rabbit', 'mouse', 'squirrel', 'deer', 'boar', 'bison', 'beaver', 'fox', 'wolf', 'lynx', 'bear', 'eagle', 'owl', 'vulture', 'crow', 'duck', 'heron', 'fish', 'frog', 'bee', 'butterfly'];
  const GRAPH_COL = ['#c49a78', '#9d9aa4', '#c9692e', '#a8643a', '#5a4434', '#3a271b', '#8a5a34', '#e0702a', '#6a6c74', '#c9a46a', '#7a4c2c', '#d4a020', '#b8966e', '#4a4240', '#2c2a34', '#2f7a4a', '#7a8ea8', '#f0a868', '#5cae4a', '#f5c518', '#ff8a3d'];
  const hidden = new Set(['bee', 'butterfly', 'mouse', 'frog']);
  function drawGraph() {
    const cvs = $('#graphCv'), ctx = cvs.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = cvs.clientWidth, H = cvs.clientHeight;
    cvs.width = W * dpr; cvs.height = H * dpr; ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const hist = S.hist;
    const pad = { l: 36, r: 10, t: 10, b: 22 };
    const shown = GRAPH_SP.filter((k) => !hidden.has(k) && hist.some((h) => h.c[U[k]] > 0));
    let max = 5;
    for (const h of hist) for (const k of shown) max = Math.max(max, h.c[U[k]]);
    const t0 = hist.length ? hist[0].t : 0, t1 = hist.length ? Math.max(hist[hist.length - 1].t, t0 + 1) : 1;
    const X = (t) => pad.l + (t - t0) / (t1 - t0) * (W - pad.l - pad.r), Y = (v) => H - pad.b - v / max * (H - pad.t - pad.b);
    ctx.strokeStyle = '#ebe9ef'; ctx.fillStyle = '#8a8494'; ctx.font = '11px system-ui'; ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const v = Math.round(max * k / 4), y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.fillText(v, 4, y + 4); }
    ctx.fillText(`jour ${Math.floor(t0)}`, pad.l, H - 6); ctx.textAlign = 'right'; ctx.fillText(`jour ${Math.floor(t1)}`, W - pad.r, H - 6); ctx.textAlign = 'left';
    ctx.lineWidth = 2;
    for (const k of shown) {
      ctx.strokeStyle = GRAPH_COL[GRAPH_SP.indexOf(k)];
      ctx.beginPath();
      hist.forEach((h, n) => { const x = X(h.t), y = Y(h.c[U[k]]); n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    const leg = $('#legend');
    leg.innerHTML = '';
    for (const k of GRAPH_SP) {
      const n = S.counts[U[k]];
      if (!n && !hist.some((h) => h.c[U[k]] > 0)) continue;
      const b = document.createElement('button');
      b.className = 'lg' + (hidden.has(k) ? ' off' : '');
      b.innerHTML = `<i style="background:${GRAPH_COL[GRAPH_SP.indexOf(k)]}"></i>${G.UNITS[U[k]].name} <b>${n}</b>`;
      b.onclick = () => { hidden.has(k) ? hidden.delete(k) : hidden.add(k); drawGraph(); };
      leg.appendChild(b);
    }
  }
  $('#graphBtn').onclick = () => { $('#graph').classList.add('show'); drawGraph(); };
  $('#graph').addEventListener('click', (e) => { if (e.target.id === 'graph' || e.target.id === 'graphX') $('#graph').classList.remove('show'); });

  // ------------------------------------------------------------------ secret words
  let typed = '';
  const KONAMI = 'ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightba';
  let konami = '';
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); setRunning(!ui.running); return; }
    konami = (konami + e.key).slice(-KONAMI.length);
    if (konami === KONAMI) { S.discoTime(); toast('🕺 Mode disco : tout le monde danse !'); konami = ''; }
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-12);
    const secret = (w, fn) => { if (typed.endsWith(w)) { typed = ''; fn(); } };
    secret('nessie', () => { if (S.spawnSecret('nessie', '🦕 Quelque chose remue dans les profondeurs du lac…') < 0) toast('🦕 Il faudrait un lac profond pour ça…'); });
    secret('dodo', () => { if (S.spawnSecret('dodo', '🦤 Un dodo ! Éteint depuis 1681… Protégez-le des renards.') >= 0) S.spawnSecret('dodo', ''); });
    secret('bigfoot', () => { if (S.spawnSecret('bigfoot', '👣 Tu l\'as appelé…') < 0) toast('👣 Bigfoot ne sort que des forêts.'); });
    secret('licorne', () => S.spawnSecret('unicorn', '🦄 Tu y crois vraiment ? Bon, d\'accord.'));
    secret('lune', () => { S.time = Math.floor(S.time / G.DAY / 8) * 8 * G.DAY + 4.95 * G.DAY; toast('🌕 Avance rapide jusqu\'à la pleine lune.'); });
  });

  // ------------------------------------------------------------------ per frame
  let lastCard = 0;
  const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
  const SEASON_ICON = ['🌸', '☀️', '🍂', '❄️'];
  ui.update = function (now) {
    if (mouse[2] && ui.tool.kind !== 'inspect') {
      const [wx, wy] = toWorld(mouse[0], mouse[1]);
      let r = ui.brush;
      if (ui.tool.kind === 'unit' && G.UNITS[ui.tool.id].flags & F.HIVE) r = 5;
      if (ui.tool.kind === 'fire') r = Math.min(r, 16);
      ui.brushPreview = { x: wx, y: wy, r, col: 0xff302830 };
    } else ui.brushPreview = null;
    for (const m of S.events.splice(0)) if (m) toast(m);
    if (now - lastCard > 300) {
      lastCard = now;
      if (ui.selected >= 0) renderCard();
      const day = S.time / G.DAY, h = S.hour(), se = S.season();
      const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 15) * 15;
      const wx = S.rain > 0.3 ? (S.weather === 'snow' ? '🌨️' : S.weather === 'storm' ? '⛈️' : '🌧️') : S.isNight() ? '🌙' : '☀️';
      $('#clock').innerHTML = `<b>Jour ${Math.floor(day) + 1}</b> · ${SEASON_ICON[se]} ${SEASONS[se]} · ${wx} ${String(hh).padStart(2, '0')}h${String(mm).padStart(2, '0')}`;
      let n = 0; for (let t = 0; t < G.NSP; t++) if (!(G.UFL[t] & F.STATIC)) n += S.counts[t];
      $('#pop').textContent = `${n.toLocaleString('fr-FR')} animaux`;
      if ($('#graph').classList.contains('show')) drawGraph();
    }
    $('#rainbow').style.opacity = Math.max(0, Math.min(1, S.rainbow)) * 0.55;
  };

  ui.init = function () { renderTabs(); renderTools(); update(); };
})();
