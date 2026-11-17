'use strict';
// ============================================================================
//  God-game interface: divine powers panel (modes, divine energy, parameters,
//  aim + confirm on the map), live news feed (click → camera), world
//  inspector (region / species sheets), ecosystem statistics, save / load.
// ============================================================================
(function () {
  const S = G.S, U = G.U, T = G.T, F = G.F, ui = G.ui;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const pl = (t) => S.plural(t), Cap = (s) => s[0].toUpperCase() + s.slice(1);
  const GU = (G.godui = { pending: null });
  const SPECIES = ['rabbit', 'mouse', 'squirrel', 'deer', 'boar', 'bison', 'beaver', 'fox', 'wolf', 'lynx', 'bear', 'eagle', 'owl', 'vulture', 'crow', 'duck', 'heron', 'fish', 'frog', 'butterfly'];
  const GENES = [[4, 'Vitesse'], [5, 'Taille'], [6, 'Vue'], [7, 'Fourrure'], [8, 'Immunité'], [1, 'Audace'], [0, 'Curiosité'], [2, 'Sociabilité'], [3, 'Paresse']];

  // ------------------------------------------------------------------ divine panel
  const state = { cat: 'Création', id: null, sp: -1, gene: 4, dir: 1, terrain: T.FOREST, k: 1, rad: null, days: null };
  const btn = el('button', 'round', G.ico('sparkle'));
  btn.id = 'godBtn'; btn.title = 'Pouvoirs divins'; btn.setAttribute('aria-label', 'Pouvoirs divins');
  $('#ctl').insertBefore(btn, $('#demo'));
  const panel = el('div', 'panel', '');
  panel.id = 'god';
  document.body.appendChild(panel);
  btn.onclick = () => { panel.classList.toggle('show'); btn.classList.toggle('on', panel.classList.contains('show')); if (!panel.classList.contains('show')) cancelAim(); render(); };
  function needsPos(p) { return p.rad > 0; }
  function ctxFor(p) {
    const c = { sp: state.sp, gene: state.gene, dir: state.dir, terrain: state.terrain };
    if (G.powers.mode() === 'experimental') { c.k = state.k; if (state.rad) c.rad = state.rad; if (state.days) c.days = state.days; }
    return c;
  }
  GU.radius = () => { const p = G.powers.get(state.id); return p ? (G.powers.mode() === 'experimental' && state.rad ? state.rad : p.rad) : 30; };
  function render() {
    if (!panel.classList.contains('show')) return;
    const mode = G.powers.mode(), P = G.powers.get(state.id);
    let h = `<div class="gh"><b>Pouvoirs divins</b><select id="gMode" title="Mode de jeu"><option value="libre">Libre</option><option value="equilibre">Divin équilibré</option><option value="experimental">Expérimental</option></select><button class="x" id="godX" aria-label="Fermer">${G.ico('x')}</button></div>`;
    if (mode === 'equilibre') h += `<div class="mana" title="Énergie divine : se recharge avec le temps, plus vite quand le monde est calme"><i style="width:${Math.min(100, S.mana || 0)}%"></i><span>${G.ico('sparkle')} ${Math.floor(S.mana || 0)} / 100</span></div>`;
    h += `<div class="gcats">${G.POWER_CATS.map((c) => `<button data-c="${c}" class="${c === state.cat ? 'on' : ''}">${c}</button>`).join('')}</div><div class="glist">`;
    for (const p of G.POWERS.filter((q) => q.cat === state.cat)) {
      const cd = mode === 'equilibre' ? ((S.powerCd || {})[p.id] || 0) - S.time / G.DAY : 0;
      h += `<button class="gp ${p.id === state.id ? 'on' : ''} ${cd > 0 || (mode === 'equilibre' && (S.mana || 0) < p.cost) ? 'dim' : ''}" data-p="${p.id}">${G.ico(p.icon)}<span>${p.name}</span>${mode === 'equilibre' ? `<small>${cd > 0 ? Math.ceil(cd) + ' j' : p.cost}</small>` : ''}</button>`;
    }
    h += '</div>';
    if (P) {
      h += '<div class="gparams">';
      const prm = P.params || [];
      if (prm.includes('sp')) {
        const all = !['species', 'animals', 'disease', 'favor'].includes(P.id);
        h += `<label>Espèce <select id="gSp">${all ? '<option value="-1">toutes les espèces</option>' : '<option value="-1">— choisir —</option>'}${SPECIES.map((k) => `<option value="${U[k]}" ${U[k] === state.sp ? 'selected' : ''}>${G.UNITS[U[k]].name}${S.counts[U[k]] ? ` (${S.counts[U[k]]})` : ''}</option>`).join('')}</select></label>`;
      }
      if (prm.includes('gene')) h += `<label>Caractère <select id="gGene">${GENES.map(([g, n]) => `<option value="${g}" ${g === state.gene ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
      if (prm.includes('dir')) h += `<label>Sens <span class="seg"><button data-d="1" class="${state.dir > 0 ? 'on' : ''}">plus</button><button data-d="-1" class="${state.dir < 0 ? 'on' : ''}">moins</button></span></label>`;
      if (prm.includes('terrain')) h += `<label>Biome <select id="gTer">${['GRASS', 'TALL', 'FLOWERS', 'BUSH', 'FOREST', 'REEDS', 'WATER', 'SAND', 'MUD', 'DIRT', 'ROCK'].map((k) => `<option value="${T[k]}" ${T[k] === state.terrain ? 'selected' : ''}>${G.TERRAIN[T[k]].name}</option>`).join('')}</select></label>`;
      if (mode === 'experimental') {
        h += `<label>Intensité <input type="range" id="gK" min="0.25" max="3" step="0.25" value="${state.k}"><b>×${state.k}</b></label>`;
        if (P.rad) h += `<label>Rayon <input type="range" id="gR" min="10" max="320" step="5" value="${state.rad || P.rad}"><b>${Math.round((state.rad || P.rad) / 4)} m</b></label>`;
        if (P.dur) h += `<label>Durée <input type="range" id="gD" min="10" max="1460" step="10" value="${state.days || P.dur}"><b>${G.dur(state.days || P.dur)}</b></label>`;
      }
      const msg = G.powers.check(P.id, ctxFor(P));
      if (needsPos(P)) h += `<p class="ghint">${msg ? `<span class="warn">${msg}</span>` : `Clique sur la carte pour viser (rayon ${Math.round(GU.radius() / 4)} m), puis confirme.`}</p>`;
      else h += `<button class="go" id="gGo" ${msg ? 'disabled' : ''}>${G.ico(P.icon)} ${P.name}</button>${msg ? `<p class="ghint warn">${msg}</p>` : ''}`;
      h += '</div>';
    }
    panel.innerHTML = h;
    $('#gMode').value = mode;
    $('#gMode').onchange = (e) => { S.godMode = e.target.value; render(); };
    $('#godX').onclick = () => btn.onclick();
    panel.querySelectorAll('.gcats button').forEach((b) => (b.onclick = () => { state.cat = b.dataset.c; state.id = null; cancelAim(); render(); }));
    panel.querySelectorAll('.gp').forEach((b) => (b.onclick = () => {
      state.id = b.dataset.p; state.rad = null; state.days = null;
      const p = G.powers.get(state.id);
      if (needsPos(p)) { ui.tool = { kind: 'power', id: p.id }; GU.pending = null; } else cancelAim();
      render();
    }));
    const on = (id, ev, fn) => { const e = $(id); if (e) e[ev] = fn; };
    on('#gSp', 'onchange', (e) => { state.sp = +e.target.value; render(); });
    on('#gGene', 'onchange', (e) => { state.gene = +e.target.value; });
    on('#gTer', 'onchange', (e) => { state.terrain = +e.target.value; });
    on('#gK', 'oninput', (e) => { state.k = +e.target.value; e.target.nextSibling.textContent = '×' + state.k; });
    on('#gR', 'oninput', (e) => { state.rad = +e.target.value; e.target.nextSibling.textContent = Math.round(state.rad / 4) + ' m'; });
    on('#gD', 'oninput', (e) => { state.days = +e.target.value; e.target.nextSibling.textContent = G.dur(state.days); });
    panel.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { state.dir = +b.dataset.d; render(); }));
    on('#gGo', 'onclick', () => activate());
  }
  function cancelAim() { GU.pending = null; confirmBar.classList.remove('show'); if (ui.tool.kind === 'power') ui.tool = { kind: 'grab' }; }
  // map click with a positional power: place the target, then ask for confirmation
  const confirmBar = el('div', 'panel', '');
  confirmBar.id = 'gconfirm';
  document.body.appendChild(confirmBar);
  GU.aim = function (x, y) {
    const p = G.powers.get(state.id);
    if (!p) return;
    GU.pending = { x, y, r: GU.radius() };
    const msg = G.powers.check(p.id, ctxFor(p));
    confirmBar.innerHTML = `${G.ico(p.icon)} <b>${p.name}</b> <span>${G.regions.name(G.regions.at(x, y))}${msg ? ` — <em class="warn">${msg}</em>` : ''}</span><button class="go" ${msg ? 'disabled' : ''}>Activer</button><button class="no">Annuler</button>`;
    confirmBar.classList.add('show');
    confirmBar.querySelector('.go').onclick = () => activate(GU.pending);
    confirmBar.querySelector('.no').onclick = () => { GU.pending = null; confirmBar.classList.remove('show'); };
  };
  function activate(pos) {
    const p = G.powers.get(state.id);
    const c = ctxFor(p);
    if (pos) { c.x = pos.x; c.y = pos.y; }
    const r = G.powers.use(p.id, c);
    if (!r.ok) ui.toast(`alert|${r.msg}`);
    else { if (!ui.running) document.querySelector('#start').click(); if (window.G.ui.mark) ui.mark('god'); }
    GU.pending = null; confirmBar.classList.remove('show');
    render();
  }

  // ------------------------------------------------------------------ live feed
  const feed = el('div', '', '');
  feed.id = 'feed';
  document.body.appendChild(feed);
  const items = [];
  G.bus.on('chronicle', (e) => {
    if (ui.skipping || e.sev < 2) return;
    items.unshift({ e, t: performance.now() });
    if (items.length > 4) items.pop();
    drawFeed();
    if (e.sev >= 3 || e.source === 'player') ui.toast(`${e.icon}|${e.title ? e.title + ' — ' : ''}${e.text}`);
  });
  function drawFeed() {
    const now = performance.now();
    for (let k = items.length - 1; k >= 0; k--) if (now - items[k].t > 45000) items.splice(k, 1);
    feed.innerHTML = items.map(({ e }, k) => `<div class="fi s${Math.min(4, e.sev)} ${e.x != null ? 'go' : ''}" data-k="${k}">${G.ico(e.icon)}<div><b>${e.title || 'Chronique'}</b><small>${G.date(e.d)}${e.r >= 0 ? ' · ' + G.regions.name(e.r) : ''}</small><span>${e.text}</span></div></div>`).join('');
    feed.querySelectorAll('.fi.go').forEach((d) => (d.onclick = () => { const e = items[+d.dataset.k].e; ui.flyTo(e.x, e.y); }));
  }
  setInterval(() => { if (items.length) drawFeed(); if (panel.classList.contains('show') && G.powers.mode() === 'equilibre') { const m = panel.querySelector('.mana i'); if (m) { m.style.width = Math.min(100, S.mana || 0) + '%'; m.nextSibling.lastChild.textContent = ` ${Math.floor(S.mana || 0)} / 100`; } } }, 2000);

  // ------------------------------------------------------------------ inspector: regions & species
  const insp = el('div', 'panel', '');
  insp.id = 'insp';
  document.body.appendChild(insp);
  const bar = (v, col) => `<i class="mb"><em style="width:${Math.max(0, Math.min(100, v * 100))}%;background:${col}"></em></i>`;
  GU.inspectRegion = function (r) {
    G.regions.update();
    const st = S.regionStats, NS = G.NSP, m = S.metrics;
    const cells = st.cells[r];
    const pct = (v) => Math.round(v / cells * 100) + ' %';
    let h = `<div class="ih">${G.ico('search')}<b>${Cap(G.regions.name(r))}</b><button class="x" id="inspX">${G.ico('x')}</button></div>`;
    h += `<div class="kv">Eau <b>${pct(st.water[r])}</b> · Forêt <b>${pct(st.forest[r])}</b> · Prairies <b>${pct(st.open[r])}</b>${st.burnt[r] ? ` · Cendres <b>${pct(st.burnt[r])}</b>` : ''}${st.rock[r] ? ` · Rochers <b>${pct(st.rock[r])}</b>` : ''}</div>`;
    h += `<div class="bar"><span>Végétation</span>${bar(st.veg[r], '#5cb85c')}</div><div class="bar"><span>Humidité du sol</span>${bar(st.moist[r], '#4aa8e8')}</div>`;
    if (m) h += `<div class="bar"><span>Pression migratoire</span>${bar(m.risk.migration[r], '#e0702a')}</div>`;
    const sp = [];
    for (let t = 0; t < NS; t++) if (st.pop[r * NS + t] > 0 && !(G.UFL[t] & F.STATIC)) sp.push([t, st.pop[r * NS + t]]);
    sp.sort((a, b) => b[1] - a[1]);
    h += `<div class="sect">Habitants</div><div class="isp">${sp.map(([t, n]) => `<button data-t="${t}"><img src="${ui.unitIcon(t)}" alt="">${G.UNITS[t].name} <b>${n}</b></button>`).join('') || '<span class="empty">personne</span>'}</div>`;
    const ev = (S.director ? S.director.active : []).filter((e) => e.r === r || e.r === -1);
    if (ev.length) h += `<div class="sect">En cours</div>${ev.map((e) => `<div class="kv">${G.ico(G.EVENT[e.id].icon)} ${G.EVENT[e.id].name}</div>`).join('')}`;
    const zones = S.zones.filter((z) => G.regions.at(z.x, z.y) === r);
    if (zones.length) h += `<div class="sect">Zones divines</div>${zones.map((z) => `<div class="kv">${{ protect: 'Sanctuaire', breed: 'Zone de reproduction', cold: 'Froid divin', heat: 'Chaleur', mort: 'Mortalité modifiée' }[z.kind] || z.kind}${z.until ? ` · encore ${Math.ceil(z.until - S.time / G.DAY)} j` : ''}</div>`).join('')}`;
    const hist = S.history.filter((e) => e.r === r && e.sev >= 2).slice(-5).reverse();
    if (hist.length) h += `<div class="sect">Histoire récente</div><div class="jr">${hist.map((e) => `<div><i>${G.date(e.d, true)}</i> ${e.title}</div>`).join('')}</div>`;
    insp.innerHTML = h; insp.classList.add('show');
    $('#inspX').onclick = () => insp.classList.remove('show');
    insp.querySelectorAll('.isp button').forEach((b) => (b.onclick = () => GU.speciesSheet(+b.dataset.t)));
  };
  GU.speciesSheet = function (t) {
    const hs = G.history.sheet(t), u = G.UNITS[t];
    let h = `<div class="ih"><img src="${ui.unitIcon(t)}" alt=""><b>${u.name}</b><button class="x" id="inspX">${G.ico('x')}</button></div>`;
    h += `<div class="kv">Aujourd'hui <b>${hs.now}</b> · record <b>${hs.peak}</b>${hs.peak ? ` (${G.date(hs.peakD, true)})` : ''}</div>`;
    h += `<div class="kv">Arrivée dans la vallée <b>${hs.first >= 0 ? G.date(hs.first, true) : '—'}</b>${hs.ext.length ? ` · disparitions <b>${hs.ext.length}</b>` : ''}${hs.back.length ? ` · retours <b>${hs.back.length}</b>` : ''}</div>`;
    const range = G.regions.rangeOf(t);
    if (range.length) h += `<div class="kv">Aire de répartition <b>${range.length} / ${G.regions.NR}</b> régions</div>`;
    // genes: now vs the first record
    const gh = S.geneHist.filter((g) => g.n[t] >= 2);
    if (gh.length) {
      const a = gh[0], b = gh[gh.length - 1], NG = S.NG;
      h += `<div class="sect">Évolution depuis ${G.date(a.t, true)}</div><div class="genes">${GENES.slice(0, 5).map(([g, n]) => { const d = (b.m[t * NG + g] - a.m[t * NG + g]) * 100; return `<div class="gb"><span>${n}</span><i><em style="left:${Math.min(50, 50 + d * 2)}%;width:${Math.abs(d * 2)}%;background:${d >= 0 ? '#3aa655' : '#e0702a'}"></em><b></b></i></div>`; }).join('')}</div><div class="kv">Génération la plus avancée <b>${b.g[t]}</b></div>`;
    }
    if (hs.traits.length) h += `<div class="sect">Adaptations & populations</div><div class="jr">${hs.traits.slice(-5).map((x) => `<div><i>${G.date(x.d, true)}</i> ${x.txt}</div>`).join('')}</div>`;
    if (hs.notables.length) h += `<div class="sect">Individus remarquables</div><div class="jr">${hs.notables.slice(-6).map((n) => `<div class="${n.alive ? 'go' : ''}" data-i="${n.alive ? n.i : -1}"><b>${n.name}</b> ${n.alive ? '' : '† '}<span>${n.note}</span></div>`).join('')}</div>`;
    if (hs.events.length) h += `<div class="sect">Son histoire</div><div class="jr">${hs.events.slice(-6).reverse().map((e) => `<div><i>${G.date(e.d, true)}</i> ${e.title}</div>`).join('')}</div>`;
    h += `<p class="d">${u.desc}</p>`;
    insp.innerHTML = h; insp.classList.add('show');
    $('#inspX').onclick = () => insp.classList.remove('show');
    insp.querySelectorAll('.jr .go').forEach((d) => (d.onclick = () => { const i = +d.dataset.i; if (i >= 0 && S.alive[i]) { ui.select(i); ui.flyTo(S.x[i], S.y[i]); } }));
  };

  // ------------------------------------------------------------------ ecosystem statistics tab
  GU.drawEco = function () {
    const box = $('#chron'), m = S.metrics || G.metrics.compute();
    if (!m) { box.innerHTML = '<p class="empty">Les statistiques apparaîtront après le premier jour de simulation.</p>'; return; }
    const sum = (a) => a.reduce((x, v) => x + v, 0);
    let ext = 0; for (const h of S.spHist) ext += h.ext.length;
    const births = sum(m.births30), deaths = sum(m.dead30);
    // ecosystem health: diversity, vegetation, balance, stability
    const health = Math.max(0, Math.min(1, m.nSpecies / 14 * 0.35 + m.food * 0.35 + (1 - m.risk.imbalance) * 0.15 + (1 - m.risk.famine) * 0.15));
    const pct = (v) => Math.round(v * 100) + ' %';
    const risk = (lbl, v) => `<div class="bar"><span>${lbl}</span>${bar(v, v > 0.6 ? '#e8584a' : v > 0.3 ? '#e0a02a' : '#5cb85c')}</div>`;
    let worstEp = 0, epT = -1, worstOv = 0, ovT = -1, worstEx = 0, exT = -1;
    for (let t = 0; t < G.NSP; t++) { if (m.risk.epidemic[t] > worstEp) { worstEp = m.risk.epidemic[t]; epT = t; } if (m.risk.overpop[t] > worstOv) { worstOv = m.risk.overpop[t]; ovT = t; } if (m.risk.extinction[t] > worstEx) { worstEx = m.risk.extinction[t]; exT = t; } }
    let h = `<div class="rsum"><div><b>${m.total}</b><span>animaux</span></div><div><b>${m.nSpecies}</b><span>espèces</span></div><div><b>${ext}</b><span>extinctions</span></div><div><b>${pct(health)}</b><span>santé de l'écosystème</span></div></div>`;
    h += `<div class="kv">Sur 30 jours : <b>${births}</b> naissances · <b>${deaths}</b> morts · prédateurs <b>${m.pred}</b> pour <b>${m.herb}</b> herbivores</div>`;
    h += `<div class="kv">Climat : <b>${G.climate.describe()}</b></div>`;
    h += `<div class="kv">Biomes : eau <b>${pct(m.waterF)}</b> · forêt <b>${pct(m.forestF)}</b> · cendres <b>${pct(m.burntF)}</b> · nourriture moyenne <b>${pct(m.food)}</b></div>`;
    h += `<div class="sect">Risques</div>${risk('Famine', m.risk.famine)}${risk('Incendie', m.risk.fire)}${risk('Déséquilibre', m.risk.imbalance)}`;
    if (epT >= 0) h += risk(`Épidémie (${pl(epT)})`, worstEp);
    if (ovT >= 0) h += risk(`Surpopulation (${pl(ovT)})`, worstOv);
    if (exT >= 0) h += risk(`Extinction (${pl(exT)})`, worstEx);
    const act = S.director.active;
    h += `<div class="sect">En cours</div>${act.length ? act.map((e) => `<div class="kv">${G.ico(G.EVENT[e.id].icon)} <b>${G.EVENT[e.id].name}</b>${e.sp != null ? ` (${pl(e.sp)})` : ''} · encore ${Math.max(0, Math.ceil(e.until - S.time / G.DAY))} j</div>`).join('') : '<div class="kv">rien de particulier : une période calme</div>'}`;
    const nb = S.notables.slice(-8).reverse();
    if (nb.length) h += `<div class="sect">Individus remarquables</div><div class="jr">${nb.map((n) => `<div class="${n.alive ? 'go' : ''}" data-i="${n.alive ? n.i : -1}"><img src="${ui.unitIcon(n.sp)}" alt=""> <b>${n.name}</b> ${n.alive ? '' : '† '}<span>${n.note}</span></div>`).join('')}</div>`;
    h += `<div class="sect">Espèces</div><div class="isp">${SPECIES.filter((k) => S.spHist[U[k]].first >= 0).map((k) => `<button data-t="${U[k]}"><img src="${ui.unitIcon(U[k])}" alt="">${G.UNITS[U[k]].name} <b>${S.counts[U[k]]}</b></button>`).join('')}</div>`;
    box.innerHTML = h;
    box.querySelectorAll('.isp button').forEach((b) => (b.onclick = () => { $('#graph').classList.remove('show'); GU.speciesSheet(+b.dataset.t); }));
    box.querySelectorAll('.jr .go').forEach((d) => (d.onclick = () => { const i = +d.dataset.i; if (i >= 0 && S.alive[i]) { $('#graph').classList.remove('show'); ui.select(i); ui.flyTo(S.x[i], S.y[i]); } }));
    $('#legend').innerHTML = ''; $('#gnote').textContent = 'Indicateurs calculés chaque jour par le directeur d\'événements : ils décident de ce qui peut arriver.';
  };

  // ------------------------------------------------------------------ save / load
  const wc = $('#wcard .cbtns');
  if (wc) {
    const box = el('div', 'cbtns', `<button id="svSave">${G.ico('scroll')} Sauvegarder</button><button id="svLoad">Charger</button><button id="svExp">Exporter</button><label class="file">Importer<input type="file" id="svImp" accept=".json,application/json"></label>`);
    wc.after(box);
    $('#svSave').onclick = () => { try { const n = G.save.toSlot(); ui.toast(`scroll|Monde sauvegardé dans ce navigateur (${Math.round(n / 1024)} Ko).`); } catch (e) { ui.toast('alert|Sauvegarde impossible : ' + e.message); } };
    $('#svLoad').onclick = () => { try { if (G.save.fromSlot()) { G.R.initWorld && G.R.initWorld(); S.terrDirty = true; ui.fitCamera(); $('#world').classList.remove('show'); ui.toast('scroll|Monde rechargé.'); } else ui.toast('alert|Aucune sauvegarde dans ce navigateur.'); } catch (e) { ui.toast('alert|Chargement impossible : ' + e.message); } };
    $('#svExp').onclick = () => { const blob = new Blob([G.save.serialize()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `petit-monde-${S.world ? S.world.seed : 'monde'}-an${Math.floor(S.time / G.DAY / 364) + 1}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    $('#svImp').onchange = (e) => { const f = e.target.files[0]; if (!f) return; f.text().then((txt) => { try { G.save.deserialize(txt); G.R.initWorld && G.R.initWorld(); S.terrDirty = true; ui.fitCamera(); $('#world').classList.remove('show'); ui.toast('scroll|Monde importé.'); } catch (err) { ui.toast('alert|Fichier invalide : ' + err.message); } }); };
  }
  G.bus.on('loaded', () => { render(); });
})();
