'use strict';
// ============================================================================
//  Divine powers. Each power:
//    id, name, cat, icon, cost (divine energy), cd (cooldown, days),
//    rad (default radius, 0 = whole world), params (sp, gene, dir, terrain),
//    dur (days, for lasting effects), cond(ctx) → refusal message or null,
//    use(ctx) → { text, cons } ; ctx = { x, y, rad, sp, gene, dir, terrain, k (intensity), days }
//  Modes: 'libre' (no limits), 'equilibre' (divine energy + cooldowns),
//  'experimental' (intensity / radius / duration under the player's control).
//  Lasting effects are data (S.godTimers), undone automatically and saved.
// ============================================================================
(function () {
  const S = G.S, U = G.U, T = G.T;
  const day = () => S.time / G.DAY;
  const spName = (t) => S.plural(t);
  const trig = (id, ctx) => G.director.trigger(id, Object.assign({ source: 'player' }, ctx));
  // timed modifiers
  function timed(entry, days) { entry.until = day() + days; (S.godTimers || (S.godTimers = [])).push(entry); }
  function spMul(t, key, mul, days) {
    const list = t == null || t < 0 ? [...Array(G.NSP).keys()].filter((q) => G.events.animalSp(q)) : [t];
    for (const q of list) { S.spMod[q][key] *= mul; timed({ type: 'spmod', t: q, key, mul }, days); }
  }
  function zone(kind, ctx, days, k = 1) { const z = { kind, x: ctx.x, y: ctx.y, r: ctx.rad, sp: ctx.sp == null ? -1 : ctx.sp, k, until: day() + days, god: true }; S.zones.push(z); return z; }
  function select(t, g, k, days) {
    const list = t == null || t < 0 ? [...Array(G.NSP).keys()].filter((q) => G.events.animalSp(q)) : [t];
    for (const q of list) { S.spMod[q].sel = { g, k }; timed({ type: 'sel', t: q }, days); }
  }
  const GENE_N = ['curiosité', 'audace', 'sociabilité', 'paresse', 'vitesse', 'taille', 'vue', 'fourrure', 'immunité', 'rythme'];
  const who = (ctx) => (ctx.sp == null || ctx.sp < 0 ? 'toutes les espèces' : `les ${spName(ctx.sp)}`);
  const needSp = (ctx) => (ctx.sp == null || ctx.sp < 0 || !S.counts[ctx.sp] ? 'Choisis une espèce présente dans la vallée.' : null);

  const P = [
    // ---------------------------------------------------------------- CRÉATION
    { id: 'lake', cat: 'Création', name: 'Créer un lac', icon: 'waves', cost: 25, cd: 5, rad: 45,
      use(c) { S.fxw.blob(c.x, c.y, c.rad, T.WATER); S.fxw.blob(c.x, c.y, c.rad * 0.55, T.DEEP); for (let k = 0; k < S.terr.length; k++) if (S.terr[k] === T.WATER || S.terr[k] === T.DEEP) S.basin[k] = 1; S.fxw.evacuate('flood', 0.3); return { text: `Un lac apparaît dans ${G.regions.name(G.regions.at(c.x, c.y))}.`, cons: ['nouveau point d\'eau', 'poissons et canards possibles'] }; } },
    { id: 'forest', cat: 'Création', name: 'Créer une forêt', icon: 'tree', cost: 20, cd: 3, rad: 50,
      use(c) { const n = S.fxw.blob(c.x, c.y, c.rad, T.FOREST, true); for (let k = 0; k < S.terr.length; k++) if (S.terr[k] === T.FOREST && S.tAge[k] === 0) S.tAge[k] = G.rand() * 4; S.fxw.evacuate('wound', 0); return { text: `Une forêt de ${n} bosquets pousse d'un coup.`, cons: ['abri pour écureuils et lynx', 'noix et baies'] }; } },
    { id: 'plant', cat: 'Création', name: 'Planter de la végétation', icon: 'sprout', cost: 10, cd: 1, rad: 60,
      use(c) {
        let n = 0;
        for (let k = 0; k < S.terr.length; k++) {
          const x = (k % S.TW) * G.TC + 4, y = ((k / S.TW) | 0) * G.TC + 4;
          if ((x - c.x) ** 2 + (y - c.y) ** 2 > c.rad * c.rad) continue;
          const tt = S.terr[k];
          if (tt === T.DIRT || tt === T.BURNT || tt === T.SAND || tt === T.MUD) { S.terr[k] = G.rand() < 0.2 ? T.FLOWERS : T.GRASS; n++; }
          if (!(tt === T.WATER || tt === T.DEEP || tt === T.ROCK)) S.veg[k] = 1;
        }
        S.fxw.dirty();
        return { text: `La végétation reverdit d'un coup${n ? ` (${n} parcelles de sol nu recolonisées)` : ''}.`, cons: ['nourriture abondante'] };
      } },
    { id: 'mountain', cat: 'Création', name: 'Élever une montagne', icon: 'alert', cost: 35, cd: 10, rad: 35,
      use(c) { S.fxw.blob(c.x, c.y, c.rad, T.ROCK); S.fxw.blob(c.x, c.y, c.rad * 1.4, T.DIRT, true); S.fxw.blob(c.x, c.y, c.rad, T.ROCK); S.fxw.evacuate('quake', 0.2); return { text: 'Une montagne surgit du sol. Les animaux doivent la contourner.', cons: ['obstacle naturel', 'risque d\'éboulements'] }; } },
    { id: 'species', cat: 'Création', name: 'Introduire une espèce', icon: 'compass', cost: 30, cd: 20, rad: 0, params: ['sp'],
      cond: (c) => (c.sp == null || c.sp < 0 ? 'Choisis l\'espèce à introduire.' : null),
      use(c) { const ev = trig('invasion', { sp: c.sp }); if (!ev) return { error: 'Cette espèce ne trouve pas d\'habitat ici.' }; return { text: `Les ${spName(c.sp)} sont introduits dans la vallée par la main divine.`, cons: ev.cons, silent: true }; } },
    { id: 'births', cat: 'Création', name: 'Favoriser les naissances', icon: 'bottle', cost: 20, cd: 30, rad: 0, dur: 90, params: ['sp'],
      use(c) { spMul(c.sp, 'fert', 1 + 0.8 * c.k, c.days); return { text: `Les naissances se multiplient chez ${who(c)} pendant ${Math.round(c.days)} jours.`, cons: ['croissance rapide', 'pression sur la nourriture'] }; } },
    // ---------------------------------------------------------------- DESTRUCTION
    { id: 'fire', cat: 'Destruction', name: 'Déclencher un incendie', icon: 'flame', cost: 15, cd: 3, rad: 30,
      use(c) { const n = S.fxw.ignite(Math.max(2, Math.round(4 * c.k)), c.x, c.y, c.rad, [T.FOREST, T.TALL, T.BUSH, T.GRASS, T.FLOWERS, T.REEDS]); if (!n) return { error: 'Rien à brûler ici.' }; return { text: 'Le feu divin s\'abat sur la végétation.', cons: ['incendie', 'cendres fertiles ensuite'] }; } },
    { id: 'flood', cat: 'Destruction', name: 'Provoquer une inondation', icon: 'waves', cost: 25, cd: 10, rad: 120,
      use(c) { const ev = trig('flood', { x: c.x, y: c.y, rad: c.rad }); if (!ev) return { error: 'Il n\'y a pas d\'eau à faire déborder ici.' }; return { silent: true }; } },
    { id: 'quake', cat: 'Destruction', name: 'Provoquer un séisme', icon: 'alert', cost: 40, cd: 20, rad: 90,
      use(c) { const ev = trig('earthquake', { x: c.x, y: c.y, rad: c.rad }); return ev ? { silent: true } : { error: 'Impossible ici.' }; } },
    { id: 'storm', cat: 'Destruction', name: 'Déclencher une tempête', icon: 'wind', cost: 20, cd: 10, rad: 140,
      use(c) { const ev = trig('storm', { x: c.x, y: c.y, rad: c.rad }); return ev ? { silent: true } : { error: 'Impossible pour l\'instant.' }; } },
    { id: 'apocalypse', cat: 'Destruction', name: 'Catastrophe majeure', icon: 'skull', cost: 80, cd: 120, rad: 0,
      use() {
        for (const id of ['eruption', 'superfire', 'earthquake', 'flood'].sort(() => G.rand() - 0.5)) { const ev = trig(id, {}); if (ev) return { silent: true }; }
        return { error: 'Aucune catastrophe majeure n\'est possible dans ce monde.' };
      } },
    // ---------------------------------------------------------------- CLIMAT
    { id: 'rain', cat: 'Climat', name: 'Faire pleuvoir', icon: 'rain', cost: 5, cd: 1, rad: 0,
      use() { S.weather = 'rain'; S.weatherT = G.DAY * 0.4; S.weatherStart = S.hour() - 5; for (let r = 0; r < S.climate.moist.length; r++) S.climate.moist[r] = Math.min(1, S.climate.moist[r] + 0.1); return { text: 'Une pluie bienfaisante tombe sur la vallée.', cons: ['sols humides', 'herbe qui repousse'] }; } },
    { id: 'snow', cat: 'Climat', name: 'Faire neiger', icon: 'cloudsnow', cost: 10, cd: 5, rad: 150, dur: 10,
      use(c) { S.weather = 'snow'; S.weatherT = G.DAY * 0.6; S.weatherStart = S.hour() - 5; S.snow = 1; zone('cold', c, c.days, 0.6 * c.k); return { text: 'La neige recouvre la région en plein ' + ['printemps', 'été', 'automne', 'hiver'][S.season()] + '.', cons: ['froid', 'dépense d\'énergie'] }; } },
    { id: 'heat', cat: 'Climat', name: 'Créer une canicule', icon: 'sun', cost: 25, cd: 30, rad: 0,
      use() { const ev = trig('heatwave', {}); return ev ? { silent: true } : { error: 'Impossible pour l\'instant.' }; } },
    { id: 'cold', cat: 'Climat', name: 'Refroidir une région', icon: 'snow', cost: 15, cd: 10, rad: 160, dur: 60,
      use(c) { zone('cold', c, c.days, 0.8 * c.k); return { text: `Un froid persistant s'installe sur ${G.regions.name(G.regions.at(c.x, c.y))} pour ${Math.round(c.days)} jours.`, cons: ['les animaux à fourrure épaisse sont avantagés'] }; } },
    { id: 'humid', cat: 'Climat', name: 'Modifier l\'humidité', icon: 'droplets', cost: 15, cd: 10, rad: 200, params: ['dir'],
      use(c) {
        const s = c.dir > 0 ? 1 : -1, cl = S.climate;
        for (let r = 0; r < cl.moist.length; r++) { const [x, y] = G.regions.center(r); if (Math.hypot(x - c.x, y - c.y) < c.rad + 60) cl.moist[r] = Math.max(0.03, Math.min(1, cl.moist[r] + s * 0.35 * c.k)); }
        return { text: s > 0 ? 'Les sols de la région se gorgent d\'eau.' : 'Les sols de la région se dessèchent.', cons: s > 0 ? ['végétation florissante', 'lacs qui remontent'] : ['végétation affaiblie', 'risque d\'incendie'] };
      } },
    { id: 'precip', cat: 'Climat', name: 'Modifier les précipitations', icon: 'rain', cost: 25, cd: 60, rad: 0, dur: 180, params: ['dir'],
      use(c) { const mul = c.dir > 0 ? 1 + c.k : 1 / (1 + c.k); S.godRain = (S.godRain || 1) * mul; timed({ type: 'rain', mul }, c.days); return { text: `${c.dir > 0 ? 'Plus' : 'Moins'} de pluie sur la vallée pendant ${Math.round(c.days)} jours.`, cons: c.dir > 0 ? ['années humides'] : ['sécheresse possible'] }; } },
    // ---------------------------------------------------------------- VIE
    { id: 'animals', cat: 'Vie', name: 'Introduire des animaux', icon: 'paw', cost: 10, cd: 1, rad: 25, params: ['sp'],
      cond: (c) => (c.sp == null || c.sp < 0 ? 'Choisis une espèce.' : null),
      use(c) {
        const n = Math.max(1, Math.round((G.UNITS[c.sp].r > 4 ? 4 : 10) * c.k)); let k = 0;
        for (let a = 0; a < n * 30 && k < n; a++) { const an = G.rand() * 6.283, d = Math.sqrt(G.rand()) * c.rad, x = c.x + Math.cos(an) * d, y = c.y + Math.sin(an) * d; if (S.okAt(c.sp, x, y) || (G.UFL[c.sp] & G.F.AIR)) { const i = S.spawn(c.sp, x, y); if (i >= 0) { k++; if (k === 1 && G.history) G.history.notable(i, 'founder', 'fondateur placé par la main divine'); } } }
        if (!k) return { error: `Un ${G.UNITS[c.sp].name.toLowerCase()} ne peut pas vivre ici.` };
        return { text: `${k} ${spName(c.sp)} déposés par la main divine.`, cons: ['nouvelle population'] };
      } },
    { id: 'favor', cat: 'Vie', name: 'Favoriser une espèce', icon: 'heart', cost: 25, cd: 30, rad: 0, dur: 180, params: ['sp'], cond: needSp,
      use(c) { spMul(c.sp, 'fert', 1 + 0.5 * c.k, c.days); spMul(c.sp, 'mort', 1 / (1 + 0.6 * c.k), c.days); spMul(c.sp, 'drain', 1 / (1 + 0.15 * c.k), c.days); return { text: `Les ${spName(c.sp)} sont bénis : plus de petits, moins de pertes, pendant ${Math.round(c.days)} jours.`, cons: ['expansion probable', 'concurrence pour les autres'] }; } },
    { id: 'protect', cat: 'Vie', name: 'Protéger une population', icon: 'shield', cost: 20, cd: 15, rad: 80, dur: 120, params: ['sp'],
      use(c) { zone('protect', c, c.days); return { text: `Un sanctuaire protège ${who(c)} des prédateurs pendant ${Math.round(c.days)} jours.`, cons: ['les prédateurs chassent ailleurs'] }; } },
    { id: 'breed', cat: 'Vie', name: 'Créer une zone de reproduction', icon: 'bottle', cost: 15, cd: 15, rad: 80, dur: 120, params: ['sp'],
      use(c) { zone('breed', c, c.days); return { text: `Une zone de reproduction (fertilité ×2, sans gêne de la densité) est créée pour ${who(c)}.`, cons: ['naissances concentrées ici'] }; } },
    { id: 'disease', cat: 'Vie', name: 'Introduire une maladie', icon: 'virus', cost: 30, cd: 30, rad: 100, params: ['sp'], cond: needSp,
      use(c) { const ev = trig('epidemic', { sp: c.sp, x: c.x, y: c.y, rad: c.rad }); return ev ? { silent: true } : { error: 'Aucun individu de cette espèce à infecter ici.' }; } },
    { id: 'mortality', cat: 'Vie', name: 'Modifier la mortalité', icon: 'tomb', cost: 20, cd: 30, rad: 0, dur: 120, params: ['sp', 'dir'],
      use(c) { const mul = c.dir > 0 ? 1 + c.k : 1 / (1 + c.k); spMul(c.sp, 'mort', mul, c.days); return { text: `La mortalité ${c.dir > 0 ? 'augmente' : 'baisse'} chez ${who(c)} pendant ${Math.round(c.days)} jours.`, cons: [] }; } },
    // ---------------------------------------------------------------- ÉVOLUTION
    { id: 'gene', cat: 'Évolution', name: 'Favoriser une caractéristique', icon: 'dna', cost: 25, cd: 30, rad: 0, dur: 364, params: ['sp', 'gene'],
      use(c) { select(c.sp, c.gene, 0.6 * c.k, c.days); return { text: `Pendant ${Math.round(c.days / 36.4) / 10} an(s), les individus à forte ${GENE_N[c.gene]} survivent mieux chez ${who(c)}.`, cons: ['évolution dirigée'] }; } },
    { id: 'mutate', cat: 'Évolution', name: 'Accélérer les mutations', icon: 'sparkle', cost: 20, cd: 60, rad: 0, dur: 364, params: ['sp'],
      use(c) { spMul(c.sp, 'mut', 1 + 6 * c.k, c.days); return { text: `Les mutations se multiplient chez ${who(c)}.`, cons: ['variants inattendus', 'diversité génétique'] }; } },
    { id: 'coldres', cat: 'Évolution', name: 'Favoriser la résistance au froid', icon: 'snow', cost: 20, cd: 30, rad: 0, dur: 364, params: ['sp'],
      use(c) { select(c.sp, 7, 0.6 * c.k, c.days); return { text: `Les fourrures épaisses sont avantagées chez ${who(c)}.`, cons: ['meilleure survie l\'hiver', 'plus de soif l\'été'] }; } },
    { id: 'speed', cat: 'Évolution', name: 'Favoriser la vitesse', icon: 'fast', cost: 20, cd: 30, rad: 0, dur: 364, params: ['sp'],
      use(c) { select(c.sp, 4, 0.6 * c.k, c.days); return { text: `Les plus rapides sont avantagés chez ${who(c)}.`, cons: ['course aux armements prédateurs / proies'] }; } },
    { id: 'immune', cat: 'Évolution', name: 'Favoriser la résistance aux maladies', icon: 'shield', cost: 20, cd: 30, rad: 0, dur: 364, params: ['sp'],
      use(c) { select(c.sp, 8, 0.6 * c.k, c.days); return { text: `Les individus résistants aux maladies sont avantagés chez ${who(c)}.`, cons: ['épidémies moins meurtrières'] }; } },
    { id: 'pressure', cat: 'Évolution', name: 'Modifier la pression de sélection', icon: 'trend', cost: 15, cd: 30, rad: 0, params: ['dir'],
      use(c) { S.selK = Math.max(0.2, Math.min(4, (S.selK || 1) * (c.dir > 0 ? 1 + c.k : 1 / (1 + c.k)))); return { text: `La sélection naturelle devient ${c.dir > 0 ? 'plus impitoyable' : 'plus clémente'} (×${S.selK.toFixed(1)}) : les gènes coûteux pèsent ${c.dir > 0 ? 'plus' : 'moins'} sur la survie.`, cons: ['évolution plus ' + (c.dir > 0 ? 'rapide' : 'lente')] }; } },
    // ---------------------------------------------------------------- MONDE
    { id: 'biome', cat: 'Monde', name: 'Modifier le biome', icon: 'globe', cost: 10, cd: 1, rad: 45, params: ['terrain'],
      use(c) { S.paintTerrain(c.x, c.y, c.rad, c.terrain); return { text: `La région devient ${G.TERRAIN[c.terrain].name.toLowerCase()}.`, cons: [] }; } },
    { id: 'resources', cat: 'Monde', name: 'Modifier les ressources', icon: 'leaf', cost: 15, cd: 5, rad: 80, params: ['dir'],
      use(c) { const s = c.dir > 0 ? 1 : -1; S.fxw.vegAdd(c.x, c.y, c.rad, s * 0.7 * c.k); S.fxw.fertilize(c.x, c.y, c.rad, s * 0.5 * c.k); return { text: s > 0 ? 'Le sol devient très fertile.' : 'Le sol s\'appauvrit.', cons: s > 0 ? ['herbe abondante'] : ['famine possible'] }; } },
    { id: 'transform', cat: 'Monde', name: 'Transformer le terrain', icon: 'sprout', cost: 20, cd: 5, rad: 60, params: ['dir'],
      use(c) {
        let n = 0;
        for (let k = 0; k < S.terr.length; k++) {
          const x = (k % S.TW) * G.TC + 4, y = ((k / S.TW) | 0) * G.TC + 4;
          if ((x - c.x) ** 2 + (y - c.y) ** 2 > c.rad * c.rad) continue;
          const tt = S.terr[k];
          if (c.dir > 0 && (tt === T.DIRT || tt === T.SAND || tt === T.BURNT || tt === T.ROCK)) { S.terr[k] = tt === T.ROCK ? T.DIRT : T.GRASS; S.veg[k] = 0.6; S.fert[k] = 1.5; n++; }
          if (c.dir < 0 && (tt === T.GRASS || tt === T.TALL || tt === T.FLOWERS || tt === T.DIRT)) { S.terr[k] = tt === T.DIRT ? T.SAND : T.DIRT; S.veg[k] = 0.05; n++; }
        }
        S.fxw.dirty();
        return { text: c.dir > 0 ? `${n} parcelles stériles deviennent des prairies fertiles.` : `${n} parcelles se changent en terre aride.`, cons: [] };
      } },
    { id: 'wall', cat: 'Monde', name: 'Créer un obstacle naturel', icon: 'hammer', cost: 15, cd: 5, rad: 70,
      use(c) {
        const a = G.rand() * Math.PI;
        for (let d = -c.rad; d <= c.rad; d += 4) { const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d; if (x > 2 && y > 2 && x < S.W - 2 && y < S.H - 2) { const k = S.tcell(x, y); S.terr[k] = T.ROCK; S.veg[k] = 0; } }
        S.fxw.evacuate('wound', 0); S.fxw.dirty();
        return { text: 'Une barre rocheuse coupe la région en deux.', cons: ['territoires séparés', 'populations isolées'] };
      } },
    { id: 'river', cat: 'Monde', name: 'Modifier la distribution de l\'eau', icon: 'drop', cost: 25, cd: 10, rad: 40, params: ['dir'],
      use(c) {
        if (c.dir < 0) { const cells = S.fxw.dryWater(c.x, c.y, c.rad, 1); for (let k = 0; k < cells.length; k += 2) { S.terr[cells[k]] = T.GRASS; S.veg[cells[k]] = 0.5; S.basin[cells[k]] = 0; } S.fxw.dirty(); return cells.length ? { text: 'Les eaux de la région sont détournées : le sol s\'assèche.', cons: ['animaux assoiffés', 'migrations'] } : { error: 'Pas d\'eau peu profonde ici.' }; }
        // carve a stream from the point to the nearest water (or the edge of the map)
        let best = null, bd = 1e9;
        for (let k = 0; k < S.terr.length; k += 3) if (S.terr[k] === T.WATER || S.terr[k] === T.DEEP) { const x = (k % S.TW) * G.TC + 4, y = ((k / S.TW) | 0) * G.TC + 4, d = (x - c.x) ** 2 + (y - c.y) ** 2; if (d < bd) { bd = d; best = [x, y]; } }
        const [tx, ty] = best || [c.x < S.W / 2 ? 0 : S.W, c.y];
        const n = Math.hypot(tx - c.x, ty - c.y) / 3;
        for (let k = 0; k <= n; k++) { const f = k / Math.max(1, n), w = Math.sin(f * 9) * 6; const x = c.x + (tx - c.x) * f - (ty - c.y) / Math.max(1, n * 3) * w, y = c.y + (ty - c.y) * f + (tx - c.x) / Math.max(1, n * 3) * w; if (x > 1 && y > 1 && x < S.W - 1 && y < S.H - 1) { S.fxw.blob(x, y, 7, T.WATER); } }
        S.fxw.blob(c.x, c.y, 14, T.WATER);
        for (let k = 0; k < S.terr.length; k++) if (S.terr[k] === T.WATER) S.basin[k] = 1;
        S.fxw.evacuate('flood', 0.2);
        return { text: 'Un nouveau ruisseau irrigue la région.', cons: ['nouveau point d\'eau', 'végétation plus verte'] };
      } },
  ];
  const BY = {}; for (const p of P) BY[p.id] = p;
  G.POWERS = P;
  G.POWER_CATS = ['Création', 'Destruction', 'Climat', 'Vie', 'Évolution', 'Monde'];
  const PW = (G.powers = {
    get: (id) => BY[id],
    mode: () => S.godMode || 'equilibre',
    // can it be used now? returns null or a refusal message
    check(id, ctx = {}) {
      const p = BY[id];
      if (!p) return 'Pouvoir inconnu.';
      if (PW.mode() === 'equilibre') {
        if ((S.mana || 0) < p.cost) return `Énergie divine insuffisante (${Math.floor(S.mana || 0)} / ${p.cost}).`;
        const cd = (S.powerCd || {})[id] || 0;
        if (cd > day()) return `Ce pouvoir se recharge (encore ${Math.ceil(cd - day())} j).`;
      }
      return p.cond ? p.cond(ctx) : null;
    },
    // activate (force = tests: ignore energy & cooldowns)
    use(id, ctx0 = {}, force) {
      const p = BY[id];
      const exp = PW.mode() === 'experimental';
      const ctx = Object.assign({ k: 1, rad: p.rad, days: p.dur || 0 }, ctx0);
      if (!exp) { ctx.k = 1; ctx.days = p.dur || 0; if (!ctx0.rad) ctx.rad = p.rad; }
      if (ctx.x == null) { ctx.x = S.W / 2; ctx.y = S.H / 2; }
      if (ctx.gene == null) ctx.gene = 4;
      if (ctx.dir == null) ctx.dir = 1;
      if (ctx.terrain == null) ctx.terrain = T.FOREST;
      const msg = force ? (p.cond ? p.cond(ctx) : null) : PW.check(id, ctx);
      if (msg) return { ok: false, msg };
      const res = p.use(ctx) || {};
      if (res.error) return { ok: false, msg: res.error };
      if (!force && PW.mode() === 'equilibre') { S.mana -= p.cost; (S.powerCd || (S.powerCd = {}))[id] = day() + p.cd; }
      if (!res.silent) G.bus.emit('power', { id, icon: p.icon, text: `${p.name} : ${res.text}`, x: p.rad ? ctx.x : null, y: p.rad ? ctx.y : null, cons: res.cons });
      else G.bus.emit('power', { id, icon: p.icon, text: `${p.name} (intervention divine)`, x: p.rad ? ctx.x : null, y: p.rad ? ctx.y : null, quiet: true });
      return { ok: true, text: res.text };
    },
    daily() {
      const d = day();
      // divine energy: slowly regenerates, faster when the world is calm
      S.mana = Math.min(100, (S.mana == null ? 60 : S.mana) + 1.2 + (S.director && S.director.active.length === 0 ? 0.8 : 0));
      // timed effects run out
      const keep = [];
      for (const e of S.godTimers || []) {
        if (e.until > d) { keep.push(e); continue; }
        if (e.type === 'spmod') S.spMod[e.t][e.key] /= e.mul;
        else if (e.type === 'sel') S.spMod[e.t].sel = null;
        else if (e.type === 'rain') S.godRain = (S.godRain || 1) / e.mul;
      }
      S.godTimers = keep;
      S.zones = S.zones.filter((z) => z.until == null || z.until > d);
    },
  });
  G.bus.on('day', () => PW.daily());
  G.bus.on('reset', () => { S.mana = 60; S.godTimers = []; S.powerCd = {}; });
})();
