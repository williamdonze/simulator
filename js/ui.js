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
    { name: 'Catastrophes', tools: ['drought', 'flood', 'storm', 'winter', 'epidemic', 'bigfire'] },
    { name: 'Plantes', terrain: ['GRASS', 'TALL', 'FLOWERS', 'BUSH', 'FOREST', 'REEDS'], items: ['hive'] },
    { name: 'Herbivores', items: ['rabbit', 'mouse', 'squirrel', 'deer', 'boar', 'bison', 'beaver'] },
    { name: 'Prédateurs', items: ['fox', 'wolf', 'lynx', 'bear'] },
    { name: 'Oiseaux', items: ['eagle', 'owl', 'vulture', 'crow', 'duck', 'heron'] },
    { name: 'Eau & insectes', terrain: ['WATER', 'DEEP'], items: ['fish', 'frog', 'butterfly'] },
    { name: 'Terrain', terrain: ['SAND', 'MUD', 'ROCK', 'DIRT'] },
  ];
  const TOOLS = {
    grab: ['Attraper / observer', 'hand', 'Clique sur un animal pour voir sa fiche, glisse-le pour le déplacer.'], rain: ['Faire pleuvoir', 'rain', ''],
    fire: ['Foudre', 'zap', 'Déclenche un incendie là où tu cliques.'], erase: ['Gomme', 'eraser', ''],
    drought: ['Sécheresse', 'sun', 'Les mares s\'assèchent et l\'herbe ne pousse presque plus pendant une saison.'],
    flood: ['Inondation', 'waves', 'La rivière déborde : les petits animaux peuvent se noyer.'],
    storm: ['Tempête', 'wind', 'Le vent abat les vieux arbres.'],
    winter: ['Hiver rigoureux', 'snow', 'Un froid extrême : la fourrure fait la différence.'],
    epidemic: ['Épidémie', 'virus', 'Une maladie frappe l\'espèce la plus nombreuse. L\'immunité fait la différence.'],
    bigfire: ['Grand incendie', 'flame', 'Plusieurs départs de feu en forêt.'],
  };
  const CATA_TOOL = { drought: 'drought', flood: 'flood', storm: 'storm', winter: 'winter', epidemic: 'epidemic', bigfire: 'fire' };
  let curTab = 2;

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
    for (const k of tab.tools || []) add(TOOLS[k][0], TOOLS[k][2], G.icoURL(TOOLS[k][1]), ui.tool.kind === k, () => {
      if (k === 'rain') { S.makeRain(); toast(S.season() === 3 ? 'cloudsnow|Il neige…' : 'rain|Il pleut : l\'herbe pousse deux fois plus vite.'); return; }
      if (CATA_TOOL[k]) {
        if (S.cata) { toast('alert|Une catastrophe est déjà en cours.'); return; }
        S.startCatastrophe(S.season(), CATA_TOOL[k]);
        if (!S.cata && k === 'epidemic') toast('alert|Aucune espèce n\'est assez nombreuse pour une épidémie.');
        if (!ui.running) setRunning(true);
        return;
      }
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
    else S.log(i, 'est observé par un naturaliste');
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
      if (!S.okAt(S.type[i], S.x[i], S.y[i])) { S.x[i] = S.px[i] = drag.ox; S.y[i] = S.py[i] = drag.oy; toast(`alert|Un ${G.UNITS[S.type[i]].name.toLowerCase()} ne peut pas vivre ici.`); }
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
    b.innerHTML = ui.running ? G.ico('pause') + ' Pause' : G.ico('play') + ' Lancer la vie';
    b.classList.toggle('pause', ui.running);
    document.querySelectorAll('#speed button').forEach((o) => o.classList.toggle('on', +o.dataset.s === ui.speed));
  }
  $('#start').onclick = () => setRunning(!ui.running);
  document.querySelectorAll('#speed button').forEach((b) => (b.onclick = () => { ui.speed = +b.dataset.s; if (!ui.running) ui.running = true; update(); }));
  ui.tk = () => (ui.speed >= 64 ? 2 : 1);
  $('#clear').onclick = () => {
    const [w, h] = ui.worldForScreen();
    if (w !== S.W || h !== S.H) { G.initWorld(w, h); G.R.initWorld(); } else S.clearAll();
    ui.fitCamera(); G.R.clearDecals(); select(-1); setRunning(false);
  };
  // new world panel
  const val = (id) => { const v = $(id).value; return v === '' ? null : +v; };
  $('#demo').onclick = () => { $('#world').classList.add('show'); };
  $('#world').addEventListener('click', (e) => { if (e.target.id === 'world' || e.target.closest('#worldX')) $('#world').classList.remove('show'); });
  function newWorld(opts) {
    G.demo(opts); ui.fitCamera(); select(-1); setRunning(true);
    $('#world').classList.remove('show');
  }
  ui.newWorld = newWorld;
  $('#worldGo').onclick = () => {
    const sd = $('#wSeed').value.trim();
    newWorld({ water: val('#wWater'), forest: val('#wForest'), predators: val('#wPred'), seed: sd ? parseInt(sd, 10) >>> 0 : null });
  };

  // ------------------------------------------------------------------ toasts + discoveries
  const queue = [];
  let toastBusy = false;
  function toast(msg) { if (ui.skipping) return; queue.push(msg); if (queue.length > 6) queue.splice(0, queue.length - 6); if (!toastBusy) nextToast(); discover(msg); }
  ui.toast = toast;
  function nextToast() {
    const t = $('#toast');
    if (!queue.length) { toastBusy = false; t.classList.remove('show'); return; }
    toastBusy = true;
    const m = G.splitMsg(queue.shift());
    t.innerHTML = (m.icon ? G.ico(m.icon) + ' ' : '') + `<span>${m.text}</span>`;
    t.classList.add('show');
    setTimeout(() => { t.classList.remove('show'); setTimeout(nextToast, 350); }, 3800);
  }

  // naturalist notebook: phenomena the player has witnessed (kept in this browser)
  const DISC = [
    ['birth', 'bottle', 'Première naissance', 'Laisse un couple adulte tranquille…', null],
    ['hunt', 'target', 'Une chasse réussie', 'Les prédateurs ont faim.', null],
    ['autumn', 'leaf', 'Le tour des saisons', 'Atteins l\'automne.', 'L\'automne'],
    ['winter', 'snow', 'Premier hiver', 'Survis jusqu\'à l\'hiver.', 'L\'hiver'],
    ['rainbow', 'rainbow', 'Arc-en-ciel', 'Après la pluie, le beau temps.', 'Un arc-en-ciel'],
    ['bolt', 'zap', 'Coup de foudre', 'Un orage d\'été…', 'La foudre'],
    ['honey', 'hex', 'Gourmand', 'Un ours, une ruche…', 'Un ours pille'],
    ['dam', 'u:beaver', 'Ingénieur', 'Un castor au bord d\'une rivière boisée.', 'Un castor construit'],
    ['nut', 'sprout', 'Jardinier distrait', 'Des écureuils en forêt.', 'Un écureuil a oublié'],
    ['rut', 'u:deer', 'Le brame', 'Des cerfs mâles en automne.', 'Le brame'],
    ['fable', 'u:fox', 'Le Renard et le Corbeau', 'Un corbeau avec quelque chose dans le bec…', '« Mon bon Monsieur'],
    ['moon', 'moon', 'Pleine lune', 'Des loups, une nuit claire.', 'Pleine lune'],
    ['golden', 'sparkle', 'Lapin doré', 'Une naissance sur 220.', 'Un lapin doré'],
    ['albino', 'sparkle', 'Albinos', 'Très rare.', 'albinos est né'],
    ['unicorn', 'u:unicorn', 'Licorne', 'Un écosystème vraiment équilibré.', 'Ton écosystème est si'],
    ['bigfoot', 'foot', 'Bigfoot', 'La nuit, dans une grande forêt.', 'Quelque chose de grand'],
    ['nessie', 'u:nessie', 'Nessie', 'Un lac profond… et un nom à taper.', 'Quelque chose remue'],
    ['dodo', 'u:dodo', 'Dodo', 'Éteint en 1681. Tape son nom.', 'Un dodo'],
    ['prince', 'crown', 'Prince charmant', 'Embrasse des grenouilles.', 'C\'était un vrai prince'],
    ['disco', 'music', 'Disco', 'Une vieille combinaison de touches…', 'Mode disco'],
    ['rabbits', 'u:rabbit', 'Invasion de lapins', 'Plus de 900 lapins.', 'Explosion de lapins'],
    ['silent', 'hush', 'Printemps silencieux', 'Il ne reste plus personne…', 'Printemps silencieux'],
    ['butterfly', 'u:butterfly', 'Métamorphose', 'Un printemps fleuri après l\'hiver.', 'Les chrysalides'],
    ['grab', 'hand', 'Main de géant', 'Attrape un animal et déplace-le.', null],
    ['name', 'tag', 'Baptême', 'Donne un nom à un animal.', null],
    ['follow', 'video', 'Documentaire', 'Suis un animal avec la caméra.', null],
    ['cata', 'alert', 'Catastrophe naturelle', 'Rare… mais ça arrive.', null],
    ['skip', 'hourglass', 'Voyageur du temps', 'Fais un bond de plusieurs années.', null],
    ['gen10', 'dna', 'Lignée', 'Une 10e génération.', null],
    ['evolve', 'trend', 'Évolution', 'Une espèce change nettement en quelques générations.', null],
    ['comeback', 'compass', 'Le retour', 'Une espèce disparue revient d\'ailleurs.', 'venus d\'ailleurs'],
  ];
  let found = {};
  try { found = JSON.parse(localStorage.getItem('petitmonde.carnet') || '{}'); } catch (e) { found = {}; }
  function mark(k) {
    if (found[k]) return;
    found[k] = Date.now();
    try { localStorage.setItem('petitmonde.carnet', JSON.stringify(found)); } catch (e) { /* storage unavailable */ }
    const d = DISC.find((x) => x[0] === k);
    if (d) setTimeout(() => toast(`book|Nouvelle découverte : ${d[2]}`), 400);
    updateBookBadge();
  }
  ui.mark = mark;
  function discover(msg) { const m = G.splitMsg(msg); if (m.icon === 'book') return; for (const d of DISC) if (d[4] && m.text.includes(d[4])) mark(d[0]); }
  function updateBookBadge() { $('#bookN').textContent = `${DISC.filter((d) => found[d[0]]).length}/${DISC.length}`; }
  function renderBook() {
    let h = '';
    for (const [k, e, title, hint] of DISC) h += found[k] ? `<div class="disc ok"><span>${G.ico(e)}</span><b>${title}</b></div>` : `<div class="disc"><span>${G.ico('help')}</span><b>???</b><small>${hint}</small></div>`;
    $('#bookGrid').innerHTML = h;
  }
  $('#bookBtn').onclick = () => { renderBook(); $('#book').classList.add('show'); };
  $('#book').addEventListener('click', (e) => { if (e.target.id === 'book' || e.target.closest('#bookX')) $('#book').classList.remove('show'); });

  // ------------------------------------------------------------------ animal sheet
  const STATE_ICON = ['foot', 'leaf', 'eye', 'drop', 'wind', 'target', 'bone', 'heart', 'moon', 'paw', 'swords', 'hammer', 'home', 'eyeoff', 'bed', 'compass', 'ball', 'ear', 'droplets', 'sparkle'];
  // personality, in words
  function persona(i) {
    const st = S.stats, m = S.sex[i] === 1, g = (a, b) => (m ? a : b), out = [];
    const tr = [
      [st.tCur[i], g('curieux', 'curieuse'), g('casanier', 'casanière')],
      [st.tBold[i], g('téméraire', 'téméraire'), g('craintif', 'craintive')],
      [st.tSoc[i], 'sociable', 'solitaire'],
      [st.tLazy[i], g('paresseux', 'paresseuse'), 'infatigable'],
      [st.tSpd[i], 'rapide', g('lent', 'lente')],
    ];
    for (const [v, hi, lo] of tr) { if (v > 0.68) out.push(hi); else if (v < 0.32) out.push(lo); }
    if (st.chron[i] < -0.6) out.push(g('lève-tôt', 'lève-tôt')); else if (st.chron[i] > 0.6) out.push(g('couche-tard', 'couche-tard'));
    return out.length ? out.join(' · ') : g('plutôt équilibré', 'plutôt équilibrée');
  }
  const fmtDay = (d) => G.date(d, true);
  let cardBuilt = -2;
  function renderCard() {
    const c = $('#card');
    if (S.obituary) {
      if (cardBuilt !== -3) {
        const o = S.obituary;
        c.innerHTML = `<div class="ch"><span class="tomb">${G.ico('tomb')}</span><div><b>${o.name}</b><small>${o.species}</small></div><button id="cardX" aria-label="Fermer">${G.ico('x')}</button></div>
          <p>${o.name} est ${o.cause} à ${G.dur(o.age)}.</p><div class="kv">Petits <b>${o.kids}</b> · Proies <b>${o.kills}</b></div>
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
      let h = `<div class="ch"><img src="${unitIcon(t)}" alt=""><div><input id="cname" value="${u.flags & F.CARCASS ? 'Carcasse' : S.nameOf(i)}" ${u.flags & (F.CARCASS | F.HIVE) ? 'disabled' : ''} aria-label="Nom de l'animal"><small id="csub"></small></div><button id="cardX" aria-label="Fermer">${G.ico('x')}</button></div>`;
      h += '<div id="cdyn"></div>';
      if (!(u.flags & F.STATIC)) h += `<div class="cbtns"><button id="cfollow"></button>${t === U.frog ? `<button id="kiss">${G.ico('heart')} Embrasser</button>` : ''}</div>`;
      c.innerHTML = h;
      c.classList.add('show');
      cardBuilt = i;
      $('#cardX').onclick = () => select(-1);
      const ni = $('#cname');
      ni.onchange = () => { const v = ni.value.trim().slice(0, 24); if (v) { S.names.set(i, v); mark('name'); toast(`tag|Bienvenue à ${v} !`); } };
      ni.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') ni.blur(); };
      const fb = $('#cfollow');
      if (fb) fb.onclick = () => {
        ui.follow = !ui.follow;
        if (ui.follow) { mark('follow'); if (G.cam.zoom < fitZoom() * 2) { G.cam.zoom = fitZoom() * 2.6; updateZoomUi(); } }
      };
      const k = $('#kiss');
      if (k) k.onclick = () => {
        if (Math.random() < 0.08) { G.fx.sparkle(S.x[i], S.y[i] - 4, 20); S.remove(i); toast('crown|C\'était un vrai prince ! Il repart vers son château.'); select(-1); }
        else toast('u:frog|Il ne se passe rien. C\'était juste une grenouille.');
      };
    }
    const fb = $('#cfollow');
    if (fb) { const on = ui.follow; if (fb.dataset.on !== String(on)) { fb.dataset.on = on; fb.innerHTML = G.ico('video') + (on ? ' Suivi actif (clic pour arrêter)' : ' Suivre avec la caméra'); } fb.classList.toggle('on', on); }
    $('#csub').textContent = `${u.name}${u.flags & F.STATIC ? '' : S.sex[i] ? ' mâle' : ' femelle'}${S.vari[i] === 1 ? ' · doré' : S.vari[i] === 2 ? ' · albinos' : ''}${u.flags & F.STATIC ? '' : ` · génération ${st.gen[i]}`}`;
    let h = '';
    if (u.flags & F.CARCASS) h += `<p>Reste de nourriture : ${S.store[i].toFixed(1)}. Elle nourrit charognards et prédateurs, puis fertilise le sol.</p>`;
    else if (u.flags & F.HIVE) h += `<p>Miel en réserve : ${S.store[i].toFixed(1)}</p>`;
    else {
      h += `<p class="st">${G.ico(STATE_ICON[S.state[i]] || 'paw')} ${S.stateName(i)}${st.sick[i] > 0 ? ' · <span class="sick">malade</span>' : ''}${S.preg[i] > 0 ? ' · attend des petits' : ''}</p>`;
      const bar = (lbl, v, col) => `<div class="bar"><span>${lbl}</span><i><em style="width:${Math.max(0, Math.min(100, v * 100))}%;background:${col}"></em></i></div>`;
      h += bar('Énergie', S.en[i], '#5cb85c');
      if (u.thirst < 50) h += bar('Hydratation', S.wat[i], '#4aa8e8');
      h += bar('Santé', S.hp[i] / G.UHP[t], '#e8584a');
      h += `<div class="kv">Âge <b>${G.dur(S.age[i])}</b> <span>· adulte à ${G.dur(u.mature)} · vit ~${G.dur(u.life)}</span></div>`;
      h += `<div class="kv">Caractère <b>${persona(i)}</b></div>`;
      { const dh = Math.hypot(S.x[i] - st.homeX[i], S.y[i] - st.homeY[i]); h += `<div class="kv">Territoire <b>~${(st.hRange[i] / 4).toFixed(0)} m</b> <span>· ${dh < st.hRange[i] ? 'chez ' + (S.sex[i] ? 'lui' : 'elle') : `à ${(dh / 4).toFixed(0)} m de chez ${S.sex[i] ? 'lui' : 'elle'}`}</span></div>`; }
      if (st.mom[i] >= 0) h += `<div class="kv">Mère <b>${S.alive[st.mom[i]] && S.type[st.mom[i]] === t && S.nameI[st.mom[i]] === st.momName[i] ? S.nameOf(st.mom[i]) : S.nameFromSeed(st.momName[i]) + ' †'}</b>${st.fatherName[i] >= 0 ? ` · Père <b>${S.nameFromSeed(st.fatherName[i])}</b>` : ''}</div>`;
      // genes: 0.5 = species average
      h += `<div class="sect">Gènes <span class="hint">(trait = moyenne de l'espèce)</span></div><div class="genes">`;
      for (const [g, lbl] of [[4, 'Vitesse'], [5, 'Taille'], [6, 'Vue'], [7, 'Fourrure'], [8, 'Immunité']]) { const v = S.GENES[g][i]; h += `<div class="gb"><span>${lbl}</span><i><em style="left:${Math.min(v, 0.5) * 100}%;width:${Math.abs(v - 0.5) * 100}%;background:${v >= 0.5 ? '#3aa655' : '#e0702a'}"></em><b></b></i></div>`; }
      h += '</div>';
      const eat = [];
      if (st.ateP[i] > 0.05) eat.push(`${G.ico('leaf')} ${(st.ateP[i] * 10).toFixed(0)} bouchées de plantes`);
      if (st.ateM[i] > 0.05) eat.push(`${G.ico('bone')} ${(st.ateM[i] * 10).toFixed(0)} portions de viande`);
      if (st.ateH[i] > 0.05) eat.push(`${G.ico('hex')} ${(st.ateH[i] * 10).toFixed(0)} rayons de miel`);
      if (st.drank[i] > 0.05) eat.push(`${G.ico('drop')} ${(st.drank[i] * 10).toFixed(0)} gorgées d'eau`);
      h += `<div class="sect">A mangé</div><div class="kv">${eat.join('<br>') || '<span>rien pour l\'instant</span>'}</div>`;
      const kl = st.klog.get(i);
      if (kl) h += `<div class="sect">Proies (${S.kills[i]})</div><div class="preys">${Object.entries(kl).map(([k, n]) => `<span title="${G.UNITS[U[k]].name}"><img src="${unitIcon(U[k])}" alt="">×${n}</span>`).join('')}</div>`;
      h += `<div class="kv">Petits <b>${S.kids[i]}</b> · Fuites <b>${st.escapes[i]}</b> · Parcouru <b>${(st.dist[i] / 4).toFixed(0)} m</b></div>`;
      if (S.journal.length && i === S.watch) h += `<div class="sect">Journal</div><div class="jr">${S.journal.slice(0, 5).map((j) => `<div><i>${fmtDay(j.d)}</i> ${j.msg}</div>`).join('')}</div>`;
      h += `<p class="d">${u.desc}</p>`;
    }
    $('#cdyn').innerHTML = h;
  }

  // ------------------------------------------------------------------ graphs: populations, evolution, chronicle
  const GRAPH_SP = ['rabbit', 'mouse', 'squirrel', 'deer', 'boar', 'bison', 'beaver', 'fox', 'wolf', 'lynx', 'bear', 'eagle', 'owl', 'vulture', 'crow', 'duck', 'heron', 'fish', 'frog', 'bee', 'butterfly'];
  const GRAPH_COL = ['#c49a78', '#9d9aa4', '#c9692e', '#a8643a', '#5a4434', '#3a271b', '#8a5a34', '#e0702a', '#6a6c74', '#c9a46a', '#7a4c2c', '#d4a020', '#b8966e', '#4a4240', '#2c2a34', '#2f7a4a', '#7a8ea8', '#f0a868', '#5cae4a', '#f5c518', '#ff8a3d'];
  const hidden = new Set(['bee', 'butterfly', 'mouse', 'frog']);
  const YD = G.SEASON_DAYS * 4;
  const fmtDate = (d) => G.date(d, true);
  const tLabel = (d, span) => span > YD * 1.5 ? `an ${Math.floor(d / YD) + 1}` : `jour ${Math.floor(d) + 1}`;
  let gTab = 'pop', evoSp = null;
  function canvasCtx() {
    const cvs = $('#graphCv'), ctx = cvs.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = cvs.clientWidth, H = cvs.clientHeight;
    cvs.width = W * dpr; cvs.height = H * dpr; ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    return [ctx, W, H];
  }
  function frameAxes(ctx, W, H, pad, t0, t1, lo, hi, fmtV) {
    const X = (t) => pad.l + (t - t0) / (t1 - t0 || 1) * (W - pad.l - pad.r), Y = (v) => H - pad.b - (v - lo) / (hi - lo || 1) * (H - pad.t - pad.b);
    ctx.strokeStyle = '#ebe9ef'; ctx.fillStyle = '#8a8494'; ctx.font = '11px system-ui'; ctx.lineWidth = 1; ctx.textAlign = 'left';
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.fillText(fmtV(v), 2, y + 4); }
    ctx.fillText(tLabel(t0, t1 - t0), pad.l, H - 6); ctx.textAlign = 'right'; ctx.fillText(tLabel(t1, t1 - t0), W - pad.r, H - 6); ctx.textAlign = 'left';
    // year marks
    if (t1 - t0 > YD * 1.5) for (let y = Math.ceil(t0 / YD) * YD; y < t1; y += YD) { const x = X(y); ctx.strokeStyle = '#f3f1f6'; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke(); }
    return [X, Y];
  }
  function drawPop() {
    const [ctx, W, H] = canvasCtx();
    const hist = S.hist;
    const pad = { l: 36, r: 10, t: 10, b: 22 };
    const shown = GRAPH_SP.filter((k) => !hidden.has(k) && hist.some((h) => h.c[U[k]] > 0));
    let max = 5;
    for (const h of hist) for (const k of shown) max = Math.max(max, h.c[U[k]]);
    const t0 = hist.length ? hist[0].t : 0, t1 = hist.length ? Math.max(hist[hist.length - 1].t, t0 + 1) : 1;
    const [X, Y] = frameAxes(ctx, W, H, pad, t0, t1, 0, max, (v) => Math.round(v));
    // forest cover, dashed, on its own 0–100 % scale
    if (!hidden.has('forest')) {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = '#2f7a3a'; ctx.lineWidth = 1.5; ctx.beginPath();
      hist.forEach((h, n) => { const x = X(h.t), y = H - pad.b - (h.forest || 0) * 2 * (H - pad.t - pad.b); n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.lineWidth = 2;
    for (const k of shown) {
      ctx.strokeStyle = GRAPH_COL[GRAPH_SP.indexOf(k)];
      ctx.beginPath();
      hist.forEach((h, n) => { const x = X(h.t), y = Y(h.c[U[k]]); n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    // catastrophes as markers
    for (const e of S.history) if (S.CATA && Object.values(S.CATA).some((c) => c.icon === e.icon) && e.d >= t0) { ctx.fillStyle = '#e8584a'; ctx.beginPath(); ctx.arc(X(e.d), pad.t + 4, 3.5, 0, 6.3); ctx.fill(); }
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
    const fb = document.createElement('button');
    fb.className = 'lg' + (hidden.has('forest') ? ' off' : '');
    const fo = hist.length ? hist[hist.length - 1].forest || 0 : 0;
    fb.innerHTML = `<i style="background:repeating-linear-gradient(90deg,#2f7a3a 0 4px,transparent 4px 6px)"></i>Forêt <b>${Math.round(fo * 100)} %</b>`;
    fb.onclick = () => { hidden.has('forest') ? hidden.delete('forest') : hidden.add('forest'); drawGraph(); };
    leg.appendChild(fb);
    $('#gnote').innerHTML = 'Clique sur une espèce pour l\'afficher ou la masquer. Pointillés : surface de forêt (échelle 0–50 %). Points rouges : catastrophes.';
  }
  const EVO_GENES = [[4, 'Vitesse', '#e0702a'], [5, 'Taille', '#8a5a34'], [6, 'Vue', '#3a7bd5'], [7, 'Fourrure', '#6a6c74'], [8, 'Immunité', '#3aa655'], [1, 'Audace', '#c9692e'], [0, 'Curiosité', '#b8966e'], [2, 'Sociabilité', '#d4a020'], [3, 'Paresse', '#9d9aa4']];
  const evoHidden = new Set([0, 2, 3]);
  function drawEvo() {
    const gh = S.geneHist, NG = S.NG;
    const present = GRAPH_SP.filter((k) => k !== 'bee' && gh.some((h) => h.n[U[k]] >= 2));
    if (evoSp == null || !present.includes(evoSp)) { let best = -1; for (const k of present) { const n = S.counts[U[k]]; if (n > best) { best = n; evoSp = k; } } }
    const [ctx, W, H] = canvasCtx();
    const leg = $('#legend');
    leg.innerHTML = '';
    if (!evoSp) { $('#gnote').textContent = 'Les moyennes génétiques sont enregistrées chaque jour : lance la vie ou fais un saut dans le temps.'; return; }
    const t = U[evoSp], pts = gh.filter((h) => h.n[t] >= 2);
    const pad = { l: 36, r: 10, t: 10, b: 22 };
    let lo = 0.35, hi = 0.65;
    for (const h of pts) for (const [g] of EVO_GENES) if (!evoHidden.has(g)) { const v = h.m[t * NG + g]; lo = Math.min(lo, v - 0.03); hi = Math.max(hi, v + 0.03); }
    const t0 = pts.length ? pts[0].t : 0, t1 = pts.length ? Math.max(pts[pts.length - 1].t, t0 + 1) : 1;
    const [X, Y] = frameAxes(ctx, W, H, pad, t0, t1, lo, hi, (v) => (v >= 0.5 ? '+' : '') + Math.round((v - 0.5) * 100));
    ctx.strokeStyle = '#c9c4d0'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(pad.l, Y(0.5)); ctx.lineTo(W - pad.r, Y(0.5)); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 2;
    for (const [g, , col] of EVO_GENES) {
      if (evoHidden.has(g)) continue;
      ctx.strokeStyle = col; ctx.beginPath();
      pts.forEach((h, n) => { const x = X(h.t), y = Y(h.m[t * NG + g]); n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    const sp = document.createElement('div'); sp.className = 'spsel';
    for (const k of present) {
      const b = document.createElement('button');
      b.className = 'lg' + (k === evoSp ? ' sel' : '');
      b.innerHTML = `<img src="${unitIcon(U[k])}" alt="">${G.UNITS[U[k]].name}`;
      b.onclick = () => { evoSp = k; drawGraph(); };
      sp.appendChild(b);
    }
    leg.appendChild(sp);
    const first = pts[0], last = pts[pts.length - 1];
    for (const [g, name, col] of EVO_GENES) {
      const b = document.createElement('button');
      b.className = 'lg' + (evoHidden.has(g) ? ' off' : '');
      const d = last && first ? (last.m[t * NG + g] - first.m[t * NG + g]) * 100 : 0;
      b.innerHTML = `<i style="background:${col}"></i>${name} <b>${d >= 0 ? '+' : ''}${d.toFixed(0)}</b>`;
      b.onclick = () => { evoHidden.has(g) ? evoHidden.delete(g) : evoHidden.add(g); drawGraph(); };
      leg.appendChild(b);
    }
    $('#gnote').innerHTML = `Valeur moyenne de chaque gène chez les ${S.plural(t)} (0 = moyenne de départ de l'espèce). Génération la plus avancée : <b>${last ? last.g[t] : 1}</b>. Les gènes passent des deux parents aux petits, avec des mutations ; ceux qui aident à survivre et à se reproduire se répandent.`;
  }
  function drawChron() {
    const el = $('#chron');
    const list = S.history.slice().reverse();
    el.innerHTML = (S.world ? `<div class="wbar">Monde n° <b>${S.world.seed}</b> <button id="replay">Rejouer ce monde</button><small>même terrain et mêmes animaux au départ ; la suite ne sera jamais identique</small></div>` : '') + (list.length ? list.map((e) => `<div class="ce">${G.ico(e.icon)}<i>${fmtDate(e.d)}</i><span>${e.text}</span></div>`).join('') : '<p class="empty">Rien de notable pour l\'instant. Les catastrophes, disparitions, retours d\'espèces et grandes lignées s\'inscriront ici.</p>');
    const rb = $('#replay'); if (rb) rb.onclick = () => { $('#graph').classList.remove('show'); newWorld(S.world.opts); };
    $('#legend').innerHTML = ''; $('#gnote').textContent = '';
  }
  function drawGraph() {
    document.querySelectorAll('#gtabs button').forEach((b) => b.classList.toggle('on', b.dataset.g === gTab));
    $('#graphCv').style.display = gTab === 'chron' ? 'none' : 'block';
    $('#chron').style.display = gTab === 'chron' ? 'block' : 'none';
    if (gTab === 'pop') drawPop(); else if (gTab === 'evo') drawEvo(); else drawChron();
  }
  function openGraph(tab) { if (tab) gTab = tab; $('#graph').classList.add('show'); drawGraph(); }
  ui.openGraph = openGraph;
  document.querySelectorAll('#gtabs button').forEach((b) => (b.onclick = () => { gTab = b.dataset.g; drawGraph(); }));
  $('#graphBtn').onclick = () => openGraph('pop');
  $('#chronBtn').onclick = () => openGraph('chron');
  $('#graph').addEventListener('click', (e) => { if (e.target.id === 'graph' || e.target.closest('#graphX')) $('#graph').classList.remove('show'); });

  // ------------------------------------------------------------------ time travel: fast-forward years, then a report
  ui.skipping = false;
  let skip = null;
  const noFx = new Proxy({}, { get: () => () => {} });
  function snapshot() {
    const NS = G.NSP, NG = S.NG, m = new Float32Array(NS * NG), n = new Int32Array(NS), gmax = new Uint16Array(NS);
    for (let i = 0; i < S.hw; i++) {
      if (!S.alive[i]) continue;
      const t = S.type[i];
      if (G.UFL[t] & (F.STATIC | F.MAGIC)) continue;
      n[t]++; gmax[t] = Math.max(gmax[t], S.stats.gen[i]);
      for (let g = 0; g < NG; g++) m[t * NG + g] += S.GENES[g][i];
    }
    for (let t = 0; t < NS; t++) if (n[t]) for (let g = 0; g < NG; g++) m[t * NG + g] /= n[t];
    let fo = 0; for (let c = 0; c < S.terr.length; c++) if (S.terr[c] === T.FOREST) fo++;
    const deaths = {}; for (const k in S.tally.deaths) deaths[k] = S.tally.deaths[k].slice();
    return { time: S.time, counts: Array.from(S.counts), m, n, gmax, forest: fo / S.terr.length, births: S.tally.births.slice(), deaths, hist: S.history.length };
  }
  function openSkip() {
    $('#skipSet').style.display = 'block'; $('#skipRun').style.display = 'none';
    $('#cataRate').value = String(S.cataRate); $('#immig').checked = S.immigration === true;
    $('#skip').classList.add('show');
  }
  $('#skipBtn').onclick = openSkip;
  $('#skip').addEventListener('click', (e) => { if (!skip && (e.target.id === 'skip' || e.target.closest('#skipX'))) $('#skip').classList.remove('show'); });
  $('#cataRate').onchange = (e) => { S.cataRate = +e.target.value; };
  $('#immig').onchange = (e) => { S.immigration = e.target.checked; };
  document.querySelectorAll('#skipYears button').forEach((b) => (b.onclick = () => startSkip(+b.dataset.y)));
  $('#skipStop').onclick = () => endSkip(true);
  function startSkip(years) {
    let n = 0; for (let t = 0; t < G.NSP; t++) if (!(G.UFL[t] & F.STATIC)) n += S.counts[t];
    if (!n) { toast('alert|Place d\'abord des animaux (ou charge le monde d\'exemple).'); return; }
    S.cataRate = +$('#cataRate').value; S.immigration = $('#immig').checked;
    select(-1);
    skip = { years, target: S.time + years * YD * G.DAY, start: snapshot(), t0: S.time };
    ui.skipping = true; G.fxReal = G.fx; G.fx = noFx; S.setTimeScale(4);
    $('#skipSet').style.display = 'none'; $('#skipRun').style.display = 'block';
  }
  ui.skipStep = function () {
    const t0 = performance.now();
    while (performance.now() - t0 < 45 && S.time < skip.target) S.step();
    S.events.length = 0;
    const done = (S.time - skip.t0) / (skip.target - skip.t0);
    $('#skipBar').style.width = Math.min(100, done * 100).toFixed(1) + '%';
    let n = 0; for (let t = 0; t < G.NSP; t++) if (!(G.UFL[t] & F.STATIC)) n += S.counts[t];
    const last = S.history.length > skip.start.hist ? S.history[S.history.length - 1] : null;
    $('#skipInfo').innerHTML = `<b>Année ${Math.floor(S.time / G.DAY / YD) + 1}</b> · ${n.toLocaleString('fr-FR')} animaux${last ? `<br>${G.ico(last.icon)} ${last.text}` : ''}`;
    if (S.time >= skip.target) endSkip(false);
  };
  function endSkip() {
    if (!skip) return;
    S.setTimeScale(1); G.fx = G.fxReal; ui.skipping = false;
    S.terrDirty = true; S.objDirty = true;
    $('#skip').classList.remove('show');
    const a = skip.start, b = snapshot();
    skip = null;
    showReport(a, b);
    mark('skip');
  }
  const GENE_WORDS = {
    4: ['plus rapides', 'plus lents', 0.4], 5: ['plus grands', 'plus petits', 0.24], 6: ['à la vue plus perçante', 'à la vue moins perçante', 0.4],
    7: ['à la fourrure plus épaisse', 'à la fourrure plus légère', 0], 8: ['plus résistants aux maladies', 'plus fragiles face aux maladies', 0],
    1: ['plus téméraires', 'plus craintifs', 0], 0: ['plus curieux', 'plus casaniers', 0], 2: ['plus sociables', 'plus solitaires', 0], 3: ['plus paresseux', 'plus actifs', 0],
  };
  function showReport(a, b) {
    const NG = S.NG, yrs = (b.time - a.time) / (G.DAY * YD);
    const sum = (arr) => arr.reduce((s, v) => s + v, 0);
    const births = sum(b.births) - sum(a.births);
    const causes = { killed: 'tués par des prédateurs', hunger: 'morts de faim', thirst: 'morts de soif', age: 'morts de vieillesse', disease: 'morts de maladie', fire: 'morts dans un incendie', flood: 'noyés', wound: 'morts de leurs blessures' };
    const dOf = (k, t) => (b.deaths[k] ? b.deaths[k][t] : 0) - (a.deaths[k] ? a.deaths[k][t] : 0);
    let deaths = 0; const dc = {};
    for (const k in b.deaths) { let n = 0; for (let t = 0; t < G.NSP; t++) n += dOf(k, t); dc[k] = n; deaths += n; }
    let h = `<div class="rsum"><div><b>${births.toLocaleString('fr-FR')}</b><span>naissances</span></div><div><b>${deaths.toLocaleString('fr-FR')}</b><span>morts</span></div>
      <div><b>${Math.max(...b.gmax)}</b><span>génération max.</span></div><div><b>${Math.round(a.forest * 100)} → ${Math.round(b.forest * 100)} %</b><span>de forêt</span></div></div>`;
    const dl = Object.entries(dc).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${n.toLocaleString('fr-FR')} ${causes[k] || k}`);
    if (dl.length) h += `<p class="rp">Causes de mort : ${dl.join(' · ')}.</p>`;
    const ev = S.history.slice(a.hist);
    h += `<div class="sect">Ce qui s'est passé</div>`;
    h += ev.length ? `<div class="rev">${ev.map((e) => `<div class="ce">${G.ico(e.icon)}<i>${fmtDate(e.d)}</i><span>${e.text}</span></div>`).join('')}</div>` : '<p class="rp">Des années calmes : aucune catastrophe, aucune disparition.</p>';
    // evolution
    const evo = [];
    let bigChange = false;
    for (const k of GRAPH_SP) {
      const t = U[k];
      if (k === 'bee' || a.n[t] < 4 || b.n[t] < 4 || b.gmax[t] <= a.gmax[t]) continue;
      const parts = [];
      for (const g of [4, 5, 6, 7, 8, 1, 0, 2, 3]) {
        const d = b.m[t * NG + g] - a.m[t * NG + g];
        if (Math.abs(d) < 0.04) continue;
        if (Math.abs(d) > 0.1) bigChange = true;
        const w = GENE_WORDS[g], pct = w[2] ? ` (${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * w[2] * 100)} %)` : '';
        parts.push({ a: Math.abs(d), s: `${Math.abs(d) > 0.1 ? 'nettement ' : ''}${d > 0 ? w[0] : w[1]}${pct}` });
      }
      if (parts.length) evo.push(`<div class="ce">${G.ico('u:' + k)}<span><b>${S.plural(t)[0].toUpperCase() + S.plural(t).slice(1)}</b> : ${parts.sort((x, y) => y.a - x.a).slice(0, 3).map((p) => p.s).join(', ')} <i>· ${b.gmax[t] - a.gmax[t]} génération${b.gmax[t] - a.gmax[t] > 1 ? 's' : ''}</i></span></div>`);
    }
    h += `<div class="sect">Évolution</div>`;
    h += evo.length ? `<div class="rev">${evo.join('')}</div>` : '<p class="rp">Pas encore de changement génétique net : il faut plus de générations (ou une pression plus forte, comme un hiver rigoureux ou des prédateurs).</p>';
    if (bigChange) mark('evolve');
    // per species
    h += `<div class="sect">Populations</div><table class="rt"><tr><th></th><th>Avant</th><th>Après</th><th>Naiss.</th><th>Morts</th><th>Gén.</th></tr>`;
    for (const k of GRAPH_SP) {
      const t = U[k];
      const c0 = a.counts[t], c1 = b.counts[t], bi = b.births[t] - a.births[t];
      if (!c0 && !c1 && !bi) continue;
      let dt = 0; for (const c in b.deaths) dt += dOf(c, t);
      h += `<tr><td>${G.ico('u:' + k)} ${G.UNITS[t].name}</td><td>${c0}</td><td class="${c1 > c0 ? 'up' : c1 < c0 ? 'dn' : ''}">${c1}${c1 === 0 && c0 > 0 ? ' †' : ''}</td><td>${bi}</td><td>${dt}</td><td>${b.gmax[t] || '–'}</td></tr>`;
    }
    h += '</table>';
    $('#reportTitle').textContent = `${yrs < 1.5 ? 'Un an' : Math.round(yrs) + ' ans'} plus tard…`;
    $('#reportBody').innerHTML = h;
    $('#report').classList.add('show');
  }
  $('#report').addEventListener('click', (e) => { if (e.target.id === 'report' || e.target.closest('#reportX')) $('#report').classList.remove('show'); });
  $('#reportEvo').onclick = () => { $('#report').classList.remove('show'); openGraph('evo'); };

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
    if (konami === KONAMI) { S.discoTime(); toast('music|Mode disco : tout le monde danse !'); konami = ''; }
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-12);
    const secret = (w, fn) => { if (typed.endsWith(w)) { typed = ''; fn(); } };
    secret('nessie', () => { if (S.spawnSecret('nessie', 'u:nessie|Quelque chose remue dans les profondeurs du lac…') < 0) toast('Il faudrait un lac profond pour ça…'); });
    secret('dodo', () => { if (S.spawnSecret('dodo', 'u:dodo|Un dodo ! Éteint depuis 1681… Protégez-le des renards.') >= 0) S.spawnSecret('dodo', ''); });
    secret('bigfoot', () => { if (S.spawnSecret('bigfoot', 'foot|Tu l\'as appelé…') < 0) toast('Bigfoot ne sort que des forêts.'); });
    secret('licorne', () => S.spawnSecret('unicorn', 'u:unicorn|Tu y crois vraiment ? Bon, d\'accord.'));
    secret('lune', () => { S.time = (Math.floor(S.time / G.DAY / 30) * 30 + 14.95) * G.DAY; toast('Avance rapide jusqu\'à la pleine lune…'); });
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') { spaceDown = false; if (mode !== 'pan' && !spaceUsed) setRunning(!ui.running); }
  });

  // ------------------------------------------------------------------ per frame
  let lastCard = 0;
  const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
  const SEASON_ICON = ['flower', 'sun', 'leaf', 'snow'];
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
    if (S.obituary && cardBuilt !== -3) { renderCard(); toast(`tomb|${S.obituary.name} est ${S.obituary.cause}.`); }
    if (now - lastCard > 300) {
      lastCard = now;
      if (ui.selected >= 0) renderCard();
      const day = S.time / G.DAY, hh0 = S.hour(), se = S.season();
      const hh = Math.floor(hh0), mm = Math.floor((hh0 - hh) * 60 / 15) * 15;
      const wx = S.rain > 0.3 ? (S.weather === 'snow' ? 'cloudsnow' : S.weather === 'storm' ? 'storm' : 'rain') : S.isNight() ? 'moon' : 'sun';
      const yd = G.SEASON_DAYS * 4;
      $('#clock').innerHTML = `<b>${G.date(day)}</b> · an ${Math.floor(day / yd) + 1} · ${G.ico(SEASON_ICON[se])} ${SEASONS[se]} · ${G.ico(wx)} ${String(hh).padStart(2, '0')}h${String(mm).padStart(2, '0')}${S.cata ? ` · <span class="cata">${G.ico(S.CATA[S.cata.kind].icon)} ${S.CATA[S.cata.kind].name}</span>` : ''}`;
      let n = 0;
      for (let t = 0; t < G.NSP; t++) if (!(G.UFL[t] & F.STATIC)) n += S.counts[t];
      $('#pop').textContent = `${n.toLocaleString('fr-FR')} animaux`;
      if ($('#graph').classList.contains('show')) drawGraph();
      if (!found.birth) { for (let k = 0; k < S.hw; k++) if (S.alive[k] && S.stats.gen[k] > 1) { mark('birth'); break; } }
      if (S.cata && !found.cata) mark('cata');
      if (!found.gen10 && S.genRec && S.genRec.some((g) => g >= 10)) mark('gen10');
      if (!found.hunt) { for (let k = 0; k < S.hw; k++) if (S.alive[k] && S.kills[k] > 0) { mark('hunt'); break; } }
    }
    $('#rainbow').style.opacity = Math.max(0, Math.min(1, S.rainbow)) * 0.55;
  };

  ui.init = function () { renderTabs(); renderTools(); update(); updateBookBadge(); setBrush(ui.brush); updateZoomUi(); };
})();
