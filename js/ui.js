'use strict';
// ============================================================================
//  UI: paint plants & animals, zoom / pan, grab & inspect animals,
//  follow camera, life journal, naturalist notebook.
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
    follow: false,
  });

  // ------------------------------------------------------------------ tabs
  const TABS = [
    { name: 'Outils', tools: ['grab', 'rain', 'fire', 'erase'] },
    { name: 'Plantes', terrain: ['GRASS', 'TALL', 'FLOWERS', 'BUSH', 'FOREST', 'REEDS'], items: ['hive'] },
    { name: 'Herbivores', items: ['rabbit', 'mouse', 'squirrel', 'deer', 'boar', 'bison', 'beaver'] },
    { name: 'Prédateurs', items: ['fox', 'wolf', 'lynx', 'bear'] },
    { name: 'Oiseaux', items: ['eagle', 'owl', 'vulture', 'crow', 'duck', 'heron'] },
    { name: 'Eau & insectes', terrain: ['WATER', 'DEEP'], items: ['fish', 'frog', 'butterfly'] },
    { name: 'Terrain', terrain: ['SAND', 'MUD', 'ROCK', 'DIRT'] },
  ];
  const TOOLS = { grab: ['Attraper / observer', '✋', 'Clique sur un animal pour voir sa fiche, glisse-le pour le déplacer.'], rain: ['Faire pleuvoir', '🌧️', ''], fire: ['Foudre', '⚡', 'Déclenche un incendie.'], erase: ['Gomme', '🧽', ''] };
  let curTab = 1;

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
    for (const k of tab.tools || []) add(TOOLS[k][0], TOOLS[k][2], emojiIcon(TOOLS[k][1]), ui.tool.kind === k, () => {
      if (k === 'rain') { S.makeRain(); toast(S.season() === 3 ? '❄️ Il neige…' : '🌧️ Il pleut : l\'herbe pousse deux fois plus vite.'); return; }
      ui.tool = { kind: k };
    });
    for (const k of tab.terrain || []) {
      const tt = T[k];
      add(G.TERRAIN[tt].name, G.TERRAIN[tt].desc, terrainIcon(k), ui.tool.kind === 'terrain' && ui.tool.id === tt, () => (ui.tool = { kind: 'terrain', id: tt }));
    }
    for (const k of tab.items || []) {
      const id = U[k], u = G.UNITS[id];
      add(u.name, u.desc, unitIcon(id), ui.tool.kind === 'unit' && ui.tool.id === id, () => (ui.tool = { kind: 'unit', id }));
    }
  }

  // ------------------------------------------------------------------ camera: fit, zoom, pan
  const cv = $('#gl');
  const toWorld = (sx, sy) => [G.cam.x + sx / G.cam.zoom, G.cam.y + sy / G.cam.zoom];
  ui.worldForScreen = function () {
    const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
    const z = Math.max(0.9, Math.min(2, w / 900));
    return [Math.round(w / z / 16) * 16, Math.round(h / z / 16) * 16];
  };
  const fitZoom = () => Math.min(cv.clientWidth / S.W, cv.clientHeight / S.H);
  function updateZoomUi() { const r = G.cam.zoom / fitZoom(); $('#zoomLvl').textContent = '×' + (r < 1.05 ? 1 : r.toFixed(1)); }
  ui.fitCamera = function () {
    const w = cv.clientWidth, h = cv.clientHeight;
    const z = fitZoom();
    G.cam.zoom = z; G.cam.x = S.W / 2 - w / z / 2; G.cam.y = S.H / 2 - h / z / 2;
    ui.follow = false; updateZoomUi();
  };
  function clampCam() {
    const w = cv.clientWidth / G.cam.zoom, h = cv.clientHeight / G.cam.zoom;
    G.cam.x = w >= S.W ? S.W / 2 - w / 2 : Math.max(-20, Math.min(S.W - w + 20, G.cam.x));
    G.cam.y = h >= S.H ? S.H / 2 - h / 2 : Math.max(-20, Math.min(S.H - h + 20, G.cam.y));
  }
  function zoomAt(sx, sy, f) {
    const [wx, wy] = toWorld(sx, sy);
    const fz = fitZoom();
    G.cam.zoom = Math.max(fz, Math.min(fz * 8, G.cam.zoom * f));
    G.cam.x = wx - sx / G.cam.zoom; G.cam.y = wy - sy / G.cam.zoom;
    clampCam(); updateZoomUi();
  }
  ui.zoomAt = zoomAt;
  window.addEventListener('resize', () => { if (G.cam.zoom <= fitZoom() * 1.01) ui.fitCamera(); else clampCam(); });
  $('#zin').onclick = () => zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1.5);
  $('#zout').onclick = () => zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1 / 1.5);
  $('#zfit').onclick = () => ui.fitCamera();

  // ------------------------------------------------------------------ painting
  let lastSpawn = 0;
  function stamp(wx, wy, first) {
    const tool = ui.tool, rb = ui.brush;
    if (tool.kind === 'terrain') { S.paintTerrain(wx, wy, rb, tool.id); return; }
    if (tool.kind === 'erase') { S.eraseAt(wx, wy, rb); S.paintTerrain(wx, wy, rb, T.GRASS); return; }
    if (tool.kind === 'fire') { S.igniteAt(wx, wy, Math.min(rb, 16)); G.fx.sparkle(wx, wy, 6); return; }
    if (tool.kind !== 'unit') return;
    const t = tool.id, u = G.UNITS[t];
    if (u.flags & F.HIVE) { if (first && S.okAt(t, wx, wy)) S.spawn(t, wx, wy); return; }
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
  function pickAt(sx, sy) {
    const [wx, wy] = toWorld(sx, sy);
    return S.pick(wx, wy, Math.max(10, 22 / G.cam.zoom));
  }
  function select(i) {
    ui.selected = i;
    S.watch = i; S.journal = []; S.obituary = null;
    if (i < 0) ui.follow = false;
    else S.log(i, 'est observé par un naturaliste 🔍');
    cardBuilt = -2;
    renderCard();
  }
  ui.select = select;

  // ------------------------------------------------------------------ pointer input
  let mode = null; // 'paint' | 'pan' | 'drag' | 'pinch'
  let panStart = null, drag = null, pinch = null, spaceDown = false, spaceUsed = false;
  const pointers = new Map();
  let mouse = [0, 0, false];
  const setBrush = (v) => { ui.brush = Math.max(4, Math.min(160, v)); $('#brush').value = Math.round(ui.brush); };
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    mouse = [e.offsetX, e.offsetY, e.pointerType === 'mouse'];
    if (pointers.size === 2) {
      if (drag) endDrag();
      mode = 'pinch';
      const p = [...pointers.values()];
      pinch = { d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), cx: (p[0][0] + p[1][0]) / 2, cy: (p[0][1] + p[1][1]) / 2 };
      return;
    }
    if (e.button === 1 || e.button === 2 || spaceDown) {
      if (spaceDown) spaceUsed = true;
      mode = 'pan'; panStart = { x: e.offsetX, y: e.offsetY, cx: G.cam.x, cy: G.cam.y, click: false }; ui.follow = false; return;
    }
    if (e.button !== 0) return;
    if (ui.tool.kind === 'grab') {
      const i = pickAt(e.offsetX, e.offsetY);
      if (i >= 0) {
        select(i);
        if (!(G.UFL[S.type[i]] & G.F.STATIC)) { mode = 'drag'; drag = { i, ox: S.x[i], oy: S.y[i], moved: false }; }
      } else { mode = 'pan'; panStart = { x: e.offsetX, y: e.offsetY, cx: G.cam.x, cy: G.cam.y, click: true }; }
      return;
    }
    mode = 'paint';
    const [wx, wy] = toWorld(e.offsetX, e.offsetY);
    lastPaint = [wx, wy];
    stamp(wx, wy, true);
  });
  cv.addEventListener('pointermove', (e) => {
    mouse = [e.offsetX, e.offsetY, e.pointerType === 'mouse' || mode === 'paint'];
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (mode === 'pinch' && pointers.size === 2) {
      const p = [...pointers.values()];
      const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), cx = (p[0][0] + p[1][0]) / 2, cy = (p[0][1] + p[1][1]) / 2;
      G.cam.x -= (cx - pinch.cx) / G.cam.zoom; G.cam.y -= (cy - pinch.cy) / G.cam.zoom;
      zoomAt(cx, cy, d / pinch.d);
      pinch = { d, cx, cy };
      return;
    }
    if (mode === 'pan') {
      if (Math.hypot(e.offsetX - panStart.x, e.offsetY - panStart.y) > 4) panStart.click = false;
      G.cam.x = panStart.cx - (e.offsetX - panStart.x) / G.cam.zoom;
      G.cam.y = panStart.cy - (e.offsetY - panStart.y) / G.cam.zoom;
      clampCam();
      return;
    }
    if (mode === 'drag' && drag) {
      const [wx, wy] = toWorld(e.offsetX, e.offsetY);
      const i = drag.i;
      if (!S.alive[i]) { drag = null; mode = null; return; }
      S.x[i] = S.px[i] = Math.max(2, Math.min(S.W - 2, wx)); S.y[i] = S.py[i] = Math.max(2, Math.min(S.H - 2, wy + 4));
      S.z[i] = 8 + G.UALT[S.type[i]];
      S.state[i] = S.ST.SLEEP; S.atk[i] = 0.2; drag.moved = true;
      return;
    }
    if (mode === 'paint') strokeTo(...toWorld(e.offsetX, e.offsetY));
  });
  function endDrag() {
    const i = drag.i;
    if (S.alive[i]) {
      S.z[i] = G.UALT[S.type[i]];
      if (!S.okAt(S.type[i], S.x[i], S.y[i])) { S.x[i] = S.px[i] = drag.ox; S.y[i] = S.py[i] = drag.oy; toast(`🙅 Un ${G.UNITS[S.type[i]].name.toLowerCase()} ne peut pas vivre ici.`); }
      else if (drag.moved) { S.log(i, 'a été déplacé par une main géante !'); G.fx.poof(S.x[i], S.y[i] - 2); mark('grab'); }
      S.state[i] = S.ST.WANDER; S.tgt[i] = -1;
    }
    drag = null;
  }
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (mode === 'drag' && drag) endDrag();
    if (mode === 'pan' && panStart && panStart.click) select(-1);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) { mode = null; if (e.pointerType !== 'mouse') mouse[2] = false; }
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('pointerleave', () => { if (!mode) mouse[2] = false; });
  cv.addEventListener('dblclick', (e) => { const i = pickAt(e.offsetX, e.offsetY); if (i >= 0) select(i); });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.shiftKey || e.altKey) setBrush(ui.brush * Math.exp(-e.deltaY * 0.0015));
    else zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0018));
  }, { passive: false });
  $('#brush').addEventListener('input', (e) => (ui.brush = +e.target.value));

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
    if (w !== S.W || h !== S.H) { G.initWorld(w, h); G.R.initWorld(); } else S.clearAll();
    ui.fitCamera(); G.R.clearDecals(); select(-1); setRunning(false);
  };
  $('#demo').onclick = () => { G.demo(); ui.fitCamera(); select(-1); setRunning(true); };

  // ------------------------------------------------------------------ toasts + discoveries
  const queue = [];
  let toastBusy = false;
  function toast(msg) { queue.push(msg); if (!toastBusy) nextToast(); discover(msg); }
  ui.toast = toast;
  function nextToast() {
    const t = $('#toast');
    if (!queue.length) { toastBusy = false; t.classList.remove('show'); return; }
    toastBusy = true;
    t.textContent = queue.shift();
    t.classList.add('show');
    setTimeout(() => { t.classList.remove('show'); setTimeout(nextToast, 350); }, 3800);
  }

  // naturalist notebook: phenomena the player has witnessed (kept in this browser)
  const DISC = [
    ['birth', '🍼', 'Première naissance', 'Laisse un couple adulte tranquille…', null],
    ['hunt', '🎯', 'Une chasse réussie', 'Les prédateurs ont faim.', null],
    ['autumn', '🍂', 'Le tour des saisons', 'Atteins l\'automne.', '🍂'],
    ['winter', '❄️', 'Premier hiver', 'Survis jusqu\'à l\'hiver.', '❄️ L\'hiver'],
    ['rainbow', '🌈', 'Arc-en-ciel', 'Après la pluie, le beau temps.', '🌈'],
    ['bolt', '⚡', 'Coup de foudre', 'Un orage d\'été…', '⚡ La foudre'],
    ['honey', '🍯', 'Gourmand', 'Un ours, une ruche…', '🐻🍯'],
    ['dam', '🦫', 'Ingénieur', 'Un castor au bord d\'une rivière boisée.', '🦫'],
    ['nut', '🌰', 'Jardinier distrait', 'Des écureuils en forêt.', '🌰'],
    ['rut', '🦌', 'Le brame', 'Des cerfs mâles en automne.', '🦌 Le brame'],
    ['fable', '🧀', 'Le Renard et le Corbeau', 'Un corbeau avec quelque chose dans le bec…', '🦊🧀'],
    ['moon', '🌕', 'Pleine lune', 'Des loups, une nuit claire.', '🌕 Pleine lune'],
    ['golden', '✨', 'Lapin doré', 'Une naissance sur 220.', '✨ Un lapin doré'],
    ['albino', '🤍', 'Albinos', 'Très rare.', '🤍'],
    ['unicorn', '🦄', 'Licorne', 'Un écosystème vraiment équilibré.', '🦄'],
    ['bigfoot', '👣', 'Bigfoot', 'La nuit, dans une grande forêt.', '👣'],
    ['nessie', '🦕', 'Nessie', 'Un lac profond… et un nom à taper.', '🦕 Quelque'],
    ['dodo', '🦤', 'Dodo', 'Éteint en 1681. Tape son nom.', '🦤 Un dodo'],
    ['prince', '👑', 'Prince charmant', 'Embrasse des grenouilles.', '✨ C\'était un vrai prince'],
    ['disco', '🕺', 'Disco', '↑↑↓↓←→←→BA', '🕺'],
    ['rabbits', '🐇', 'Invasion de lapins', 'Plus de 900 lapins.', '🐇 Explosion'],
    ['silent', '🤫', 'Printemps silencieux', 'Il ne reste plus personne…', '🤫'],
    ['butterfly', '🦋', 'Métamorphose', 'Un printemps fleuri après l\'hiver.', '🦋 Les chrysalides'],
    ['grab', '✋', 'Main de géant', 'Attrape un animal et déplace-le.', null],
    ['name', '🏷️', 'Baptême', 'Donne un nom à un animal.', null],
    ['follow', '🎥', 'Documentaire', 'Suis un animal avec la caméra.', null],
  ];
  let found = {};
  try { found = JSON.parse(localStorage.getItem('petitmonde.carnet') || '{}'); } catch (e) { found = {}; }
  function mark(k) {
    if (found[k]) return;
    found[k] = Date.now();
    try { localStorage.setItem('petitmonde.carnet', JSON.stringify(found)); } catch (e) { /* storage unavailable */ }
    const d = DISC.find((x) => x[0] === k);
    if (d) setTimeout(() => toast(`📖 Nouvelle découverte : ${d[1]} ${d[2]}`), 400);
    updateBookBadge();
  }
  ui.mark = mark;
  function discover(msg) { if (msg.startsWith('📖')) return; for (const d of DISC) if (d[4] && msg.startsWith(d[4])) mark(d[0]); }
  function updateBookBadge() { $('#bookN').textContent = `${DISC.filter((d) => found[d[0]]).length}/${DISC.length}`; }
  function renderBook() {
    let h = '';
    for (const [k, e, title, hint] of DISC) h += found[k] ? `<div class="disc ok"><span>${e}</span><b>${title}</b></div>` : `<div class="disc"><span>❓</span><b>???</b><small>${hint}</small></div>`;
    $('#bookGrid').innerHTML = h;
  }
  $('#bookBtn').onclick = () => { renderBook(); $('#book').classList.add('show'); };
  $('#book').addEventListener('click', (e) => { if (e.target.id === 'book' || e.target.id === 'bookX') $('#book').classList.remove('show'); });

  // ------------------------------------------------------------------ animal sheet
  const STATE_ICON = ['🚶', '🌿', '👀', '💧', '💨', '🎯', '🍖', '💕', '💤', '🐾', '⚔️', '🔨', '🏠', '🫣'];
  const fmtDay = (d) => `J${Math.floor(d) + 1} ${String(Math.floor((d % 1) * 24)).padStart(2, '0')}h`;
  let cardBuilt = -2;
  function renderCard() {
    const c = $('#card');
    if (S.obituary) {
      if (cardBuilt !== -3) {
        const o = S.obituary;
        c.innerHTML = `<div class="ch"><span class="tomb">🪦</span><div><b>${o.name}</b><small>${o.species}</small></div><button id="cardX" aria-label="Fermer">✕</button></div>
          <p>${o.name} est ${o.cause} à ${o.age.toFixed(1)} jours.</p><div class="kv">Petits <b>${o.kids}</b> · Proies <b>${o.kills}</b></div>
          <div class="jr">${S.journal.slice(0, 6).map((j) => `<div><i>${fmtDay(j.d)}</i> ${j.msg}</div>`).join('')}</div>`;
        c.classList.add('show');
        $('#cardX').onclick = () => { S.obituary = null; select(-1); };
        ui.selected = -1; ui.follow = false; cardBuilt = -3;
      }
      return;
    }
    const i = ui.selected;
    if (i < 0 || !S.alive[i]) { c.classList.remove('show'); ui.selected = -1; cardBuilt = -2; return; }
    const t = S.type[i], u = G.UNITS[t], st = S.stats;
    if (cardBuilt !== i) {
      let h = `<div class="ch"><img src="${unitIcon(t)}" alt=""><div><input id="cname" value="${u.flags & F.CARCASS ? 'Carcasse' : S.nameOf(i)}" ${u.flags & (F.CARCASS | F.HIVE) ? 'disabled' : ''} aria-label="Nom de l'animal"><small id="csub"></small></div><button id="cardX" aria-label="Fermer">✕</button></div>`;
      h += '<div id="cdyn"></div>';
      if (!(u.flags & F.STATIC)) h += `<div class="cbtns"><button id="cfollow"></button>${t === U.frog ? '<button id="kiss">💋 Embrasser</button>' : ''}</div>`;
      c.innerHTML = h;
      c.classList.add('show');
      cardBuilt = i;
      $('#cardX').onclick = () => select(-1);
      const ni = $('#cname');
      ni.onchange = () => { const v = ni.value.trim().slice(0, 24); if (v) { S.names.set(i, v); mark('name'); toast(`🏷️ Bienvenue à ${v} !`); } };
      ni.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') ni.blur(); };
      const fb = $('#cfollow');
      if (fb) fb.onclick = () => {
        ui.follow = !ui.follow;
        if (ui.follow) { mark('follow'); if (G.cam.zoom < fitZoom() * 2) { G.cam.zoom = fitZoom() * 2.6; updateZoomUi(); } }
      };
      const k = $('#kiss');
      if (k) k.onclick = () => {
        if (Math.random() < 0.08) { G.fx.sparkle(S.x[i], S.y[i] - 4, 20); S.remove(i); toast('✨ C\'était un vrai prince ! Il repart vers son château.'); select(-1); }
        else toast('🐸 Il ne se passe rien. C\'était juste une grenouille.');
      };
    }
    const fb = $('#cfollow');
    if (fb) { fb.textContent = ui.follow ? '🎥 Suivi actif (clic pour arrêter)' : '🎥 Suivre avec la caméra'; fb.classList.toggle('on', ui.follow); }
    $('#csub').textContent = `${u.name}${u.flags & F.STATIC ? '' : S.sex[i] ? ' ♂' : ' ♀'}${S.vari[i] === 1 ? ' · doré ✨' : S.vari[i] === 2 ? ' · albinos' : ''}${u.flags & F.STATIC ? '' : ` · génération ${st.gen[i]}`}`;
    let h = '';
    if (u.flags & F.CARCASS) h += `<p>Reste de nourriture : ${S.store[i].toFixed(1)}. Elle nourrit charognards et prédateurs, puis fertilise le sol.</p>`;
    else if (u.flags & F.HIVE) h += `<p>Miel en réserve : ${S.store[i].toFixed(1)}</p>`;
    else {
      h += `<p class="st">${STATE_ICON[S.state[i]]} ${S.STATE_NAMES[S.state[i]]}${S.preg[i] > 0 ? ' · attend des petits 🍼' : ''}</p>`;
      const bar = (lbl, v, col) => `<div class="bar"><span>${lbl}</span><i><em style="width:${Math.max(0, Math.min(100, v * 100))}%;background:${col}"></em></i></div>`;
      h += bar('Énergie', S.en[i], '#5cb85c');
      if (u.thirst < 50) h += bar('Hydratation', S.wat[i], '#4aa8e8');
      h += bar('Santé', S.hp[i] / G.UHP[t], '#e8584a');
      h += `<div class="kv">Âge <b>${S.age[i].toFixed(1)} j</b> <span>· adulte à ${u.mature} j · vit ~${u.life} j</span></div>`;
      if (st.mom[i] >= 0) h += `<div class="kv">Mère <b>${S.alive[st.mom[i]] && S.type[st.mom[i]] === t && S.nameI[st.mom[i]] === st.momName[i] ? S.nameOf(st.mom[i]) : S.nameFromSeed(st.momName[i]) + ' †'}</b></div>`;
      const eat = [];
      if (st.ateP[i] > 0.05) eat.push(`🌿 ${(st.ateP[i] * 10).toFixed(0)} bouchées de plantes`);
      if (st.ateM[i] > 0.05) eat.push(`🍖 ${(st.ateM[i] * 10).toFixed(0)} portions de viande`);
      if (st.ateH[i] > 0.05) eat.push(`🍯 ${(st.ateH[i] * 10).toFixed(0)} rayons de miel`);
      if (st.drank[i] > 0.05) eat.push(`💧 ${(st.drank[i] * 10).toFixed(0)} gorgées d'eau`);
      h += `<div class="sect">A mangé</div><div class="kv">${eat.join('<br>') || '<span>rien pour l\'instant</span>'}</div>`;
      const kl = st.klog.get(i);
      if (kl) h += `<div class="sect">Proies (${S.kills[i]})</div><div class="preys">${Object.entries(kl).map(([k, n]) => `<span title="${G.UNITS[U[k]].name}"><img src="${unitIcon(U[k])}" alt="">×${n}</span>`).join('')}</div>`;
      h += `<div class="kv">Petits <b>${S.kids[i]}</b> · Fuites <b>${st.escapes[i]}</b> · Parcouru <b>${(st.dist[i] / 4).toFixed(0)} m</b></div>`;
      if (S.journal.length && i === S.watch) h += `<div class="sect">Journal</div><div class="jr">${S.journal.slice(0, 5).map((j) => `<div><i>${fmtDay(j.d)}</i> ${j.msg}</div>`).join('')}</div>`;
      h += `<p class="d">${u.desc}</p>`;
    }
    $('#cdyn').innerHTML = h;
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
    ctx.fillText(`jour ${Math.floor(t0) + 1}`, pad.l, H - 6); ctx.textAlign = 'right'; ctx.fillText(`jour ${Math.floor(t1) + 1}`, W - pad.r, H - 6); ctx.textAlign = 'left';
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

  // ------------------------------------------------------------------ keyboard & secret words
  let typed = '';
  const KONAMI = 'ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightba';
  let konami = '';
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { spaceDown = true; spaceUsed = false; } return; }
    if (e.key === '+' || e.key === '=') zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1.3);
    else if (e.key === '-') zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1 / 1.3);
    else if (e.key === '[') setBrush(ui.brush / 1.25);
    else if (e.key === ']') setBrush(ui.brush * 1.25);
    else if (e.key === 'Escape') select(-1);
    konami = (konami + e.key).slice(-KONAMI.length);
    if (konami === KONAMI) { S.discoTime(); toast('🕺 Mode disco : tout le monde danse !'); konami = ''; }
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-12);
    const secret = (w, fn) => { if (typed.endsWith(w)) { typed = ''; fn(); } };
    secret('nessie', () => { if (S.spawnSecret('nessie', '🦕 Quelque chose remue dans les profondeurs du lac…') < 0) toast('Il faudrait un lac profond pour ça…'); });
    secret('dodo', () => { if (S.spawnSecret('dodo', '🦤 Un dodo ! Éteint depuis 1681… Protégez-le des renards.') >= 0) S.spawnSecret('dodo', ''); });
    secret('bigfoot', () => { if (S.spawnSecret('bigfoot', '👣 Tu l\'as appelé…') < 0) toast('Bigfoot ne sort que des forêts.'); });
    secret('licorne', () => S.spawnSecret('unicorn', '🦄 Tu y crois vraiment ? Bon, d\'accord.'));
    secret('lune', () => { S.time = Math.floor(S.time / G.DAY / 8) * 8 * G.DAY + 4.95 * G.DAY; toast('Avance rapide jusqu\'à la pleine lune…'); });
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') { spaceDown = false; if (mode !== 'pan' && !spaceUsed) setRunning(!ui.running); }
  });

  // ------------------------------------------------------------------ per frame
  let lastCard = 0;
  const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
  const SEASON_ICON = ['🌸', '☀️', '🍂', '❄️'];
  ui.update = function (now) {
    if (mouse[2] && ui.tool.kind !== 'grab' && mode !== 'pan') {
      const [wx, wy] = toWorld(mouse[0], mouse[1]);
      let r = ui.brush;
      if (ui.tool.kind === 'unit' && G.UNITS[ui.tool.id].flags & F.HIVE) r = 5;
      if (ui.tool.kind === 'fire') r = Math.min(r, 16);
      ui.brushPreview = { x: wx, y: wy, r, col: 0xff302830 };
    } else ui.brushPreview = null;
    cv.style.cursor = mode === 'pan' ? 'grabbing' : ui.tool.kind === 'grab' ? (mode === 'drag' ? 'grabbing' : 'grab') : 'crosshair';
    for (const m of S.events.splice(0)) if (m) toast(m);
    // follow camera
    const i = ui.selected;
    if (ui.follow && i >= 0 && S.alive[i]) {
      const w = cv.clientWidth / G.cam.zoom, h = cv.clientHeight / G.cam.zoom;
      G.cam.x += (S.x[i] - w / 2 - G.cam.x) * 0.12; G.cam.y += (S.y[i] - h / 2 - G.cam.y) * 0.12;
      clampCam();
    }
    if (S.obituary && cardBuilt !== -3) { renderCard(); toast(`🪦 ${S.obituary.name} est ${S.obituary.cause}.`); }
    if (now - lastCard > 300) {
      lastCard = now;
      if (ui.selected >= 0) renderCard();
      const day = S.time / G.DAY, hh0 = S.hour(), se = S.season();
      const hh = Math.floor(hh0), mm = Math.floor((hh0 - hh) * 60 / 15) * 15;
      const wx = S.rain > 0.3 ? (S.weather === 'snow' ? '🌨️' : S.weather === 'storm' ? '⛈️' : '🌧️') : S.isNight() ? '🌙' : '☀️';
      $('#clock').innerHTML = `<b>Jour ${Math.floor(day) + 1}</b> · ${SEASON_ICON[se]} ${SEASONS[se]} · ${wx} ${String(hh).padStart(2, '0')}h${String(mm).padStart(2, '0')}`;
      let n = 0;
      for (let t = 0; t < G.NSP; t++) if (!(G.UFL[t] & F.STATIC)) n += S.counts[t];
      $('#pop').textContent = `${n.toLocaleString('fr-FR')} animaux`;
      if ($('#graph').classList.contains('show')) drawGraph();
      if (!found.birth) { for (let k = 0; k < S.hw; k++) if (S.alive[k] && S.stats.gen[k] > 1) { mark('birth'); break; } }
      if (!found.hunt) { for (let k = 0; k < S.hw; k++) if (S.alive[k] && S.kills[k] > 0) { mark('hunt'); break; } }
    }
    $('#rainbow').style.opacity = Math.max(0, Math.min(1, S.rainbow)) * 0.55;
  };

  ui.init = function () { renderTabs(); renderTools(); update(); updateBookBadge(); setBrush(ui.brush); updateZoomUi(); };
})();
