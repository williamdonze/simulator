'use strict';
// ============================================================================
//  Event catalogue. Each entry:
//   id, name, cat (climat | catastrophe | écologie | biologie | évolution),
//   icon, sev (1 minor … 5 historic), cooldown (days), excl (incompatible ids),
//   when(m, ctx)   → probability per day given the world indicators m (0 = impossible)
//   target(m, ctx) → { r, x, y, rad, sp } or null when it cannot happen here
//   dur(m, ev)     → duration in days (0 = instantaneous)
//   start(ev, m)   → immediate effects, returns { text, cons[] }
//   daily(ev, m)   → progressive effects while active
//   done(ev, m)    → optional early end
//   end(ev, m)     → lasting effects, returns a text (or null)
//   mods(ev)       → global modifiers while active { temp, wet, grow, fire, cold, heat, rain, wind }
//   chain          → possible consequences [id, probability, minDelay, maxDelay] (see chains.js)
// ============================================================================
(function () {
  const S = G.S, U = G.U, T = G.T, F = G.F;
  const R = () => G.regions;
  const rnd = () => G.rand();
  const between = (a, b) => a + rnd() * (b - a);
  const NS = () => G.NSP;
  const name = (t) => G.UNITS[t].name.toLowerCase();
  const pl = (t) => S.plural(t);
  const Pl = (t) => { const p = pl(t); return p[0].toUpperCase() + p.slice(1); };
  const animalSp = (t) => !(G.UFL[t] & (F.STATIC | F.HIDDEN | F.MAGIC)) && t !== U.bee && G.UNITS[t].mature < 1e8;
  const isHerb = (t) => !G.PREY[t];
  const regionTarget = (r, k = 1) => { const [x, y] = R().center(r); return { r, x, y, rad: R().radius() * k }; };
  const bestRegion = (score) => { let b = -1, bs = -1e9; for (let r = 0; r < R().NR; r++) { const s = score(r); if (s > bs) { bs = s; b = r; } } return b; };
  const st = () => S.regionStats;
  const cata = () => (S.cataRate == null ? 1 : S.cataRate);
  // temporary species modifiers, undone when the event ends
  function modSp(ev, t, key, mul) { S.spMod[t][key] *= mul; (ev.revert || (ev.revert = [])).push([t, key, mul]); }
  function addPrey(ev, t, mask) { const old = S.spMod[t].extraPrey; S.spMod[t].extraPrey |= mask; (ev.revertPrey || (ev.revertPrey = [])).push([t, old]); }
  function addZone(ev, z) { S.zones.push(z); (ev.zones || (ev.zones = [])).push(z); }
  const migrate = (fn, ...a) => (G.migration ? G.migration[fn](...a) : 0);
  const rockCells = (r) => (st() ? st().rock[r] : 0);
  const anyRock = () => { if (!st()) return false; for (let r = 0; r < R().NR; r++) if (st().rock[r] > 6) return true; return false; };
  const anyWater = () => st() && st().water.some((w) => w > 10);

  const E = [
    // ======================================================== CLIMAT
    {
      id: 'heatwave', name: 'Canicule exceptionnelle', cat: 'climat', icon: 'sun', sev: 3, cooldown: 120,
      when: (m) => (m.season === 1 && m.temp > 20 ? 0.004 * (m.regime === 'chaud' || m.regime === 'sec' ? 3 : 1) * cata() : 0),
      target: () => ({ r: -1 }), dur: () => between(8, 18),
      start: () => ({ text: 'Une canicule écrase la vallée : l\'herbe grille, les points d\'eau baissent et le moindre feu peut tout embraser.', cons: ['soif accrue', 'herbe qui grille', 'risque d\'incendie'] }),
      daily: () => { const cl = S.climate; for (let r = 0; r < cl.moist.length; r++) cl.moist[r] = Math.max(0.03, cl.moist[r] - 0.012); },
      mods: () => ({ temp: 8, wet: -0.4, grow: 0.75, fire: 1.8, heat: 1.25 }),
      end: () => 'La canicule prend fin.',
      chain: [['wildfire', 0.35, 1, 8], ['drought', 0.3, 3, 15]],
    },
    {
      id: 'drought', name: 'Sécheresse prolongée', cat: 'climat', icon: 'sun', sev: 4, cooldown: 300, major: true,
      when: (m) => ((m.season === 1 || m.season === 2) && m.moist < 0.42 ? 0.006 * (0.5 - m.moist) * 10 * (m.regime === 'sec' ? 2 : 1) * cata() : 0),
      target: () => { const r = bestRegion((r) => -st().moist[r] + rnd() * 0.05); return regionTarget(r, 1.8); },
      dur: () => between(50, 120),
      start(ev) {
        ev.cells = S.fxw.dryWater(ev.x, ev.y, ev.rad, 0.7);
        return { text: `Une longue sécheresse s'installe sur ${R().name(ev.r)} : les mares s'assèchent, l'herbe jaunit, les herbivores cherchent l'eau.`, cons: ['mares asséchées', 'végétation affaiblie', 'migrations vers l\'eau'] };
      },
      daily(ev) { const cl = S.climate; for (const r of [ev.r, ...R().neighbours(ev.r)]) cl.moist[r] = Math.max(0.03, cl.moist[r] - 0.009); if (Math.floor(ev.age) % 10 === 5) migrate('crisis', null, ev.r, 'sécheresse'); },
      mods: () => ({ rain: 0.25, fire: 1.6, heat: 1.15, temp: 1.5 }),
      end(ev) { const half = []; for (let k = 0; k < ev.cells.length; k += 2) if (rnd() < 0.6) half.push(ev.cells[k], ev.cells[k + 1]); S.fxw.restore(half, T.MUD); return 'La pluie revient enfin : la sécheresse est terminée. Une partie des mares se remplit.'; },
      chain: [['famine', 0.45, 5, 30], ['wildfire', 0.3, 2, 20], ['renewal', 0.6, 200, 400]],
    },
    {
      id: 'harshWinter', name: 'Hiver extrême', cat: 'climat', icon: 'snow', sev: 4, cooldown: 300, major: true,
      when: (m) => (m.season === 3 && m.temp < 4 ? 0.006 * (m.regime === 'froid' ? 3 : 1) * cata() : 0),
      target: () => ({ r: -1 }), dur: () => between(40, 70),
      start: () => { S.weather = 'snow'; S.weatherT = G.DAY * 4; S.weatherStart = 0; return { text: 'Un froid polaire s\'abat sur la vallée. Seuls les animaux à la fourrure épaisse et bien nourris passeront l\'hiver.', cons: ['dépense d\'énergie accrue', 'végétation gelée', 'sélection de la fourrure'] }; },
      mods: () => ({ temp: -9, grow: 0.3 }),
      end: () => 'Le grand froid se retire.',
      chain: [['famine', 0.3, 5, 30], ['adaptation', 0.5, 120, 260]],
    },
    {
      id: 'storm', name: 'Tempête majeure', cat: 'climat', icon: 'wind', sev: 3, cooldown: 90,
      when: (m) => ((m.season === 2 || m.season === 3) ? 0.005 * cata() : m.season === 1 ? 0.0015 * cata() : 0),
      target: () => regionTarget(bestRegion((r) => st().forest[r] + rnd() * 50), 1.4), dur: () => between(1, 2),
      start(ev) {
        S.weather = 'storm'; S.weatherT = G.DAY * 0.6; S.weatherStart = 0;
        ev.felled = S.fxw.fellTrees(ev.x, ev.y, ev.rad, 0.05);
        return { text: ev.felled > 3 ? `Une tempête balaie ${R().name(ev.r)} : ${ev.felled} arbres arrachés. Les clairières vont se repeupler de buissons.` : `Une violente tempête balaie ${R().name(ev.r)}, sans grands dégâts faute de grands arbres.`, cons: ['arbres abattus', 'nouvelles clairières'] };
      },
      mods: () => ({ wind: 1, rain: 3 }),
      chain: [['flood', 0.2, 0, 3], ['wildfire', 0.08, 0, 4]],
    },
    {
      id: 'deluge', name: 'Pluies torrentielles', cat: 'climat', icon: 'rain', sev: 2, cooldown: 60,
      when: (m) => ((m.season === 0 || m.season === 2) && m.moist > 0.4 ? 0.004 * (m.regime === 'humide' ? 2.5 : 1) * cata() : 0),
      target: () => ({ r: -1 }), dur: () => between(3, 6),
      start: () => { S.weather = 'storm'; S.weatherT = G.DAY * 3; S.weatherStart = 0; return { text: 'Des pluies diluviennes s\'abattent pendant plusieurs jours. Les sols sont détrempés et les rivières gonflent.', cons: ['sols détrempés', 'risque de crue', 'risque de glissement de terrain'] }; },
      daily: () => { const cl = S.climate; for (let r = 0; r < cl.moist.length; r++) cl.moist[r] = Math.min(1, cl.moist[r] + 0.06); },
      mods: () => ({ rain: 6, wet: 0.6, fire: 0.2 }),
      chain: [['flood', 0.55, 0, 3], ['landslide', 0.35, 0, 4]],
    },
    {
      id: 'wetPeriod', name: 'Période exceptionnellement humide', cat: 'climat', icon: 'droplets', sev: 2, cooldown: 400,
      when: (m) => (m.regime === 'humide' || m.moist > 0.72 ? 0.002 : 0),
      target: () => ({ r: -1 }), dur: () => between(120, 240),
      start: () => ({ text: 'Une période exceptionnellement humide commence : les lacs remontent, l\'herbe est grasse… et les parasites prolifèrent.', cons: ['lacs qui remontent', 'herbe abondante', 'parasites'] }),
      daily: () => { const cl = S.climate; for (let r = 0; r < cl.moist.length; r++) cl.moist[r] = Math.min(1, cl.moist[r] + 0.004); },
      mods: () => ({ rain: 1.7, grow: 1.25, fire: 0.5, wet: 0.3 }),
      end: () => 'Le temps redevient plus sec.',
      chain: [['parasites', 0.35, 20, 90], ['boom', 0.4, 60, 150]],
    },
    // ======================================================== CATASTROPHES
    {
      id: 'wildfire', name: 'Grand incendie', cat: 'catastrophe', icon: 'flame', sev: 3, cooldown: 60,
      when: (m) => ((m.season === 1 || m.season === 2) && m.risk.fire > 0.3 ? 0.005 * m.risk.fire * cata() : 0),
      target: () => regionTarget(bestRegion((r) => st().forest[r] * (1.2 - st().moist[r]) + rnd() * 20), 1.3),
      dur: () => between(2, 4),
      start(ev) {
        ev.burnt0 = S.terr.reduce((a, v) => a + (v === T.BURNT), 0);
        const n = S.fxw.ignite(3, ev.x, ev.y, ev.rad); S.wind = 0.5;
        if (!n) return null;
        return { text: `Un incendie se déclare dans ${R().name(ev.r)}. Le vent pousse les flammes.`, cons: ['forêt brûlée', 'animaux en fuite', 'cendres fertiles'] };
      },
      mods: () => ({ wind: 0.5 }),
      end(ev) {
        const burnt = S.terr.reduce((a, v) => a + (v === T.BURNT), 0) - ev.burnt0;
        S.fxw.fertilize(ev.x, ev.y, ev.rad, 0.35);
        return burnt > 0 ? `L'incendie est éteint : ${Math.round(burnt * 64 / 10000 * 10) / 10} ha partis en fumée. Les cendres enrichiront le sol.` : 'L\'incendie s\'est éteint de lui-même.';
      },
      chain: [['renewal', 0.8, 300, 600]],
    },
    {
      id: 'superfire', name: 'Super-incendie', cat: 'catastrophe', icon: 'flame', sev: 5, cooldown: 700, major: true,
      when: (m) => (m.risk.fire > 0.65 && (G.director.isActive('drought') || G.director.isActive('heatwave')) ? 0.004 * cata() : 0),
      target: () => ({ r: -1 }), dur: () => between(3, 5),
      start(ev) {
        const n = S.fxw.ignite(10, 0, 0, 0); S.wind = 0.95;
        if (!n) return null;
        return { text: 'Un super-incendie ravage la vallée de toutes parts. Des forêts entières disparaissent ; la vallée en portera les traces pendant des années.', cons: ['forêts détruites', 'exodes massifs', 'sols enrichis de cendres'] };
      },
      mods: () => ({ wind: 0.95, fire: 2.2 }),
      end: () => { S.fxw.fertilize(0, 0, 0, 0.3); return 'Le super-incendie est enfin maîtrisé par la pluie.'; },
      chain: [['renewal', 1, 400, 800], ['famine', 0.35, 10, 60], ['invasion', 0.2, 100, 300]],
    },
    {
      id: 'flood', name: 'Inondation', cat: 'catastrophe', icon: 'waves', sev: 3, cooldown: 120,
      when: (m) => (anyWater() && m.moist > 0.72 ? 0.003 * cata() : 0),
      target: () => regionTarget(bestRegion((r) => st().water[r] + rnd() * 5), 1.5),
      dur: () => between(4, 8),
      start(ev) {
        const res = S.fxw.flood(ev.x, ev.y, ev.rad, 3);
        ev.cells = res.cells;
        if (!res.cells.length) return null;
        S.weather = 'rain'; S.weatherT = G.DAY; S.weatherStart = 0;
        return { text: `La rivière sort de son lit dans ${R().name(ev.r)}. ${res.victims ? res.victims + ' petits animaux se noient.' : 'Les animaux fuient vers les hauteurs.'}`, cons: ['terres inondées', 'noyades', 'limon fertile'] };
      },
      end(ev) {
        for (let k = 0; k < ev.cells.length; k += 2) { const c = ev.cells[k]; if (S.terr[c] === T.WATER) { S.terr[c] = ev.cells[k + 1]; S.veg[c] = 1; S.fert[c] = Math.min(2, S.fert[c] + 0.5); } }
        S.fxw.dirty();
        return 'La crue se retire et laisse un limon fertile.';
      },
      chain: [['epidemic', 0.2, 10, 40]],
    },
    {
      id: 'earthquake', name: 'Séisme', cat: 'catastrophe', icon: 'alert', sev: 4, cooldown: 500, major: true,
      when: () => 0.00035 * cata(),
      target: () => regionTarget((rnd() * R().NR) | 0, 1),
      dur: () => 1,
      start(ev) {
        const n = S.fxw.crack(ev.x, ev.y, 260) + S.fxw.crack(ev.x, ev.y, 180);
        const felled = S.fxw.fellTrees(ev.x, ev.y, ev.rad * 0.7, 0.12);
        const dead = S.fxw.harm(ev.x, ev.y, 70, 0.25, 'quake');
        let extra = '';
        if (rnd() < 0.5) { const a = rnd() * 6.283; S.fxw.blob(ev.x + Math.cos(a) * 60, ev.y + Math.sin(a) * 60, 14 + rnd() * 14, T.WATER, false); S.fxw.evacuate('quake', 0.5); extra = ' Le sol s\'affaisse et une nouvelle mare apparaît.'; }
        else if (anyWater()) { const cells = S.fxw.dryWater(ev.x, ev.y, ev.rad, 1); if (cells.length) extra = ' Une partie des eaux s\'infiltre dans les fissures.'; }
        return { text: `La terre tremble dans ${R().name(ev.r)} : failles, ${felled} arbres renversés${dead ? `, ${dead} animaux tués` : ''}.${extra}`, cons: ['failles et rochers', 'arbres renversés', 'eaux déplacées'] };
      },
      chain: [['landslide', 0.5, 0, 3], ['earthquake', 0.12, 5, 40]],
    },
    {
      id: 'eruption', name: 'Éruption volcanique', cat: 'catastrophe', icon: 'flame', sev: 5, cooldown: 3000, major: true,
      when: () => (anyRock() ? 0.00012 * cata() : 0),
      target() {
        const r = bestRegion((r) => rockCells(r) + rnd());
        if (rockCells(r) < 6) return null;
        // centre of the rocky massif
        let sx = 0, sy = 0, n = 0;
        for (let c = 0; c < S.terr.length; c++) if (S.terr[c] === T.ROCK && S.regionOf[c] === r) { sx += c % S.TW; sy += (c / S.TW) | 0; n++; }
        return { r, x: sx / n * G.TC + 4, y: sy / n * G.TC + 4, rad: R().radius() * 1.6 };
      },
      dur: () => 300,
      start(ev) {
        S.fxw.blob(ev.x, ev.y, 16, T.ROCK, false);
        S.fxw.blob(ev.x, ev.y, 55, T.BURNT, true);
        const dead = S.fxw.harm(ev.x, ev.y, 90, 0.8, 'lava');
        S.fxw.ignite(8, ev.x, ev.y, 160);
        S.fxw.vegAdd(ev.x, ev.y, 260, -0.6);
        S.fxw.fertilize(ev.x, ev.y, 280, 0.8);
        S.fxw.blob(ev.x, ev.y, 16, T.ROCK, false);
        return { text: `Le massif rocheux ${R().de(ev.r)} entre en éruption ! Coulées de lave, pluie de cendres${dead ? `, ${dead} animaux tués` : ''}. Les cendres voilent le soleil : l'année sera froide.`, cons: ['terres brûlées', 'hiver volcanique', 'sols très fertiles ensuite'] };
      },
      mods: (ev) => ({ temp: -2.5 * (1 - ev.age / 300), grow: 0.85 }),
      end: () => 'Le ciel se dégage : les cendres volcaniques sont retombées et nourrissent le sol.',
      chain: [['renewal', 1, 300, 600]],
    },
    {
      id: 'landslide', name: 'Glissement de terrain', cat: 'catastrophe', icon: 'alert', sev: 2, cooldown: 120,
      when: (m) => (anyRock() && m.moist > 0.75 ? 0.002 * cata() : 0),
      target() {
        const r = bestRegion((r) => rockCells(r) * (1 + st().moist[r]) + rnd());
        if (rockCells(r) < 3) return null;
        for (let k = 0; k < 4000; k++) { const c = (rnd() * S.terr.length) | 0; if (S.terr[c] === T.ROCK && S.regionOf[c] === r) return { r, x: (c % S.TW) * G.TC + 4, y: ((c / S.TW) | 0) * G.TC + 4, rad: 40 }; }
        return null;
      },
      dur: () => 0,
      start(ev) {
        const a = rnd() * 6.283, x = ev.x + Math.cos(a) * 30, y = ev.y + Math.sin(a) * 30;
        S.fxw.blob(x, y, 26, T.DIRT, true);
        const dead = S.fxw.harm(x, y, 30, 0.7, 'landslide');
        S.fxw.evacuate('landslide', 0.3);
        return { text: `Un pan de montagne s'effondre dans ${R().name(ev.r)}${dead ? ` et ensevelit ${dead} animaux` : ''}. Une coulée de terre nue remplace la végétation.`, cons: ['coulée de terre', 'végétation détruite'] };
      },
    },
    // ======================================================== ÉCOLOGIE
    {
      id: 'overpop', needWhen: true, name: 'Surpopulation', cat: 'écologie', icon: 'users', sev: 2, cooldown: 150, perSpecies: true,
      when: (m, ctx) => (ctx.sp != null && m.risk.overpop[ctx.sp] > 0.5 && m.pop[ctx.sp] > 40 ? 0.12 : 0),
      target: (m, ctx) => { const r = bestRegion((r) => st().pop[r * NS() + ctx.sp]); return Object.assign(regionTarget(r), { sp: ctx.sp }); },
      dur: () => between(60, 120),
      start(ev, m) {
        modSp(ev, ev.sp, 'fert', 0.5);
        return { text: `Surpopulation de ${pl(ev.sp)} (${m.pop[ev.sp]}) : la nourriture manque, le stress fait chuter les naissances.`, cons: ['naissances en baisse', 'maladies possibles', 'départs vers d\'autres régions'] };
      },
      chain: [['epidemic', 0.4, 10, 40], ['massMigration', 0.5, 1, 10], ['famine', 0.25, 10, 40]],
    },
    {
      id: 'famine', needWhen: true, name: 'Famine', cat: 'écologie', icon: 'skull', sev: 3, cooldown: 150,
      when: (m) => (m.risk.famine > 0.5 ? 0.08 : 0),
      target: () => regionTarget(bestRegion((r) => (G.S.metrics ? G.S.metrics.risk.migration[r] : 0) + rnd() * 0.05), 1.5),
      dur: () => between(30, 80),
      start(ev) {
        for (let t = 0; t < NS(); t++) if (animalSp(t) && isHerb(t)) modSp(ev, t, 'fert', 0.6);
        const n = migrate('crisis', null, ev.r, 'famine');
        return { text: `La famine frappe ${R().name(ev.r)} : les herbivores maigrissent et ${n ? `${n} animaux partent` : 'commencent à partir'} chercher de quoi manger ailleurs.`, cons: ['morts de faim', 'naissances en baisse', 'migrations de crise'] };
      },
      daily(ev) { if (Math.floor(ev.age) % 12 === 6) migrate('crisis', null, ev.r, 'famine'); },
      end: () => 'La famine prend fin : la végétation a repris le dessus.',
      chain: [['preyCollapse', 0.5, 20, 60]],
    },
    {
      id: 'preyCollapse', needWhen: true, name: 'Effondrement d\'une population de proies', cat: 'écologie', icon: 'trend', sev: 3, cooldown: 200, perSpecies: true,
      when: (m, ctx) => { const t = ctx.sp; return t != null && isHerb(t) && m.pop90[t] >= 20 && m.pop[t] < m.pop90[t] * 0.4 ? 0.25 : 0; },
      target: (m, ctx) => ({ r: -1, sp: ctx.sp }),
      dur: () => between(90, 150),
      start(ev, m) {
        // predators that relied on it switch to other prey and raise fewer young
        const preds = [];
        for (let p = 0; p < NS(); p++) if (G.PREY[p] & (1 << ev.sp) && m.pop[p] > 0) {
          preds.push(p); modSp(ev, p, 'fert', 0.6);
          let alt = 0; for (let q = 0; q < NS(); q++) if (q !== ev.sp && isHerb(q) && animalSp(q) && G.UNITS[q].r <= G.UNITS[p].r * 1.4) alt |= 1 << q;
          addPrey(ev, p, alt);
          migrate('crisis', p, -1, 'proies disparues');
        }
        return { text: `Les ${pl(ev.sp)} s'effondrent (${m.pop90[ev.sp]} → ${m.pop[ev.sp]} en trois mois).${preds.length ? ` Leurs prédateurs (${preds.map(pl).join(', ')}) se rabattent sur d'autres proies.` : ''}`, cons: ['changement de proies', 'prédateurs affamés', 'territoires redistribués'] };
      },
    },
    {
      id: 'boom', needWhen: true, name: 'Explosion démographique', cat: 'écologie', icon: 'trend', sev: 2, cooldown: 250, perSpecies: true,
      when: (m, ctx) => { const t = ctx.sp; return t != null && m.pop[t] > 30 && m.pop[t] > m.pop90[t] * 2.2 ? 0.2 : 0; },
      target: (m, ctx) => ({ r: -1, sp: ctx.sp }), dur: () => 0,
      start: (ev, m) => ({ text: `Explosion démographique : les ${pl(ev.sp)} passent de ${m.pop90[ev.sp]} à ${m.pop[ev.sp]} en trois mois.`, cons: ['pression sur la végétation', 'aubaine pour les prédateurs'] }),
      chain: [['overpop', 0.5, 40, 90]],
    },
    {
      id: 'expansion', needWhen: true, name: 'Expansion d\'une espèce dominante', cat: 'écologie', icon: 'compass', sev: 2, cooldown: 365, perSpecies: true,
      when: (m, ctx) => { const t = ctx.sp; return t != null && m.pop[t] > 60 && m.regionsOf[t] >= 6 && m.regionsOf[t] < R().NR && m.pop[t] > m.pop90[t] ? 0.03 : 0; },
      target: (m, ctx) => ({ r: -1, sp: ctx.sp }), dur: () => 0,
      start(ev) { const n = migrate('colonize', ev.sp, 3); if (!n) return null; return { text: `Les ${pl(ev.sp)}, devenu${S.e(ev.sp)}s dominant${S.e(ev.sp)}s, colonisent de nouvelles régions (${n} pionniers).`, cons: ['nouveaux territoires', 'compétition avec les espèces locales'] }; },
    },
    {
      id: 'extinction', name: 'Disparition d\'une espèce', cat: 'écologie', icon: 'skull', sev: 4, cooldown: 0, perSpecies: true, forcedOnly: true,
      when: () => 0, target: (m, ctx) => ({ r: -1, sp: ctx.sp }), dur: () => 0,
      start: (ev) => ({ text: `Les ${pl(ev.sp)} ont disparu de la vallée. Leur niche écologique est vide.`, cons: ['niche vacante', 'proies ou prédateurs libérés'] }),
      chain: [['invasion', 0.25, 60, 300]],
    },
    {
      id: 'collapse', name: 'Effondrement de l\'écosystème', cat: 'écologie', icon: 'hush', sev: 5, cooldown: 700, major: true,
      when: (m) => (m.total365 > 40 && m.total < 0.3 * m.total365 && m.d > 200 ? 0.2 : 0),
      target: () => ({ r: -1 }), dur: () => 0,
      start: (ev, m) => ({ text: `Effondrement de l'écosystème : il ne reste que ${m.total} animaux, un tiers de ce que comptait la vallée il y a un an.`, cons: ['chaînes alimentaires rompues'] }),
      chain: [['renewal', 0.7, 300, 700], ['invasion', 0.3, 100, 400]],
    },
    // ======================================================== BIOLOGIE
    {
      id: 'epidemic', name: 'Épidémie', cat: 'biologie', icon: 'virus', sev: 3, cooldown: 120, perSpecies: true,
      when: (m, ctx) => (ctx.sp != null && m.risk.epidemic[ctx.sp] > 0.3 && m.pop[ctx.sp] >= 15 ? 0.008 * m.risk.epidemic[ctx.sp] * cata() : 0),
      target: (m, ctx) => {
        let t = ctx.sp;
        if (t == null) { let b = 0; for (let k = 0; k < NS(); k++) if (animalSp(k) && m.pop[k] > b) { b = m.pop[k]; t = k; } }
        if (t == null || m.pop[t] < 6) return null;
        const r = ctx.x != null ? R().at(ctx.x, ctx.y) : bestRegion((r) => st().pop[r * NS() + t]);
        return Object.assign(ctx.x != null ? { r, x: ctx.x, y: ctx.y, rad: ctx.rad || 80 } : regionTarget(r, 1.3), { sp: t });
      },
      dur: () => 120,
      start(ev) {
        const n = S.fxw.infect(ev.sp, 0.4, ev.x, ev.y, ev.rad) + S.fxw.infect(ev.sp, 0.03);
        ev.n0 = G.S.counts[ev.sp]; ev.d0 = (S.tally.deaths.disease || [])[ev.sp] || 0;
        if (!n) return null;
        return { text: `Une maladie se déclare chez les ${pl(ev.sp)} ${R().de(ev.r)} (${n} malades). Les individus à forte immunité ont plus de chances de survivre.`, cons: ['contagion', 'mortalité', 'sélection de l\'immunité'] };
      },
      done: (ev) => ev.age > 8 && S.fxw.sickCount(ev.sp) === 0,
      end: (ev) => { const dead = ((S.tally.deaths.disease || [])[ev.sp] || 0) - ev.d0; return `Fin de l'épidémie chez les ${pl(ev.sp)} : ${dead} mort${dead > 1 ? 's' : ''} de la maladie ; ${G.S.counts[ev.sp]} ${pl(ev.sp)} aujourd'hui.`; },
      chain: [['adaptation', 0.6, 120, 300]],
    },
    {
      id: 'mutation', name: 'Mutation exceptionnelle', cat: 'biologie', icon: 'dna', sev: 1, cooldown: 60,
      when: () => 0.004,
      target(m, ctx) {
        const cands = [];
        for (let i = 0; i < S.hw; i += 3) if (S.alive[i] && animalSp(S.type[i]) && S.age[i] < G.UNITS[S.type[i]].mature && (ctx.sp == null || S.type[i] === ctx.sp)) cands.push(i);
        if (!cands.length) return null;
        const i = cands[(rnd() * cands.length) | 0];
        return { r: R().at(S.x[i], S.y[i]), x: S.x[i], y: S.y[i], rad: 20, sp: S.type[i], i };
      },
      dur: () => 0,
      start(ev) {
        const W = [[4, 'très rapide', 'très lent'], [5, 'géant', 'nain'], [6, 'à la vue perçante', 'presque aveugle'], [7, 'à l\'épaisse fourrure', 'presque sans poils'], [8, 'résistant aux maladies', 'à l\'immunité fragile']];
        const [g, hi, lo] = W[(rnd() * W.length) | 0], up = rnd() < 0.55;
        S.GENES[g][ev.i] = up ? 0.9 + rnd() * 0.1 : rnd() * 0.1;
        if (g === 5) S.stats.gsz[ev.i] = 0.88 + 0.24 * S.GENES[5][ev.i];
        if (G.history) G.history.notable(ev.i, 'mutant', `porteur d'une mutation rare : ${up ? hi : lo}`);
        return { text: `${S.un(ev.sp)[0].toUpperCase() + S.un(ev.sp).slice(1)} ${name(ev.sp)} ${up ? hi : lo} est né${S.e(ev.sp)} (${S.nameOf(ev.i)}). Sa mutation se transmettra peut-être à ses descendants.`, cons: ['nouveau variant génétique'] };
      },
      chain: [['adaptation', 0.25, 200, 500]],
    },
    {
      id: 'invasion', name: 'Invasion biologique', cat: 'biologie', icon: 'compass', sev: 3, cooldown: 400,
      when: (m) => (m.d > 120 ? 0.0012 * cata() : 0),
      target(m, ctx) {
        const opts = [];
        for (let t = 0; t < NS(); t++) {
          if (!animalSp(t) || (ctx.sp != null && t !== ctx.sp)) continue;
          if (ctx.sp == null && m.pop[t] > 5) continue;
          // habitat must exist: water species need water, squirrels forest, everyone needs food
          const u = G.UNITS[t];
          if ((u.hab === G.HB.WATER || u.hab === G.HB.AMPHI || u.hab === G.HB.SHORE) && m.waterF < 0.01) continue;
          if (t === U.squirrel && m.forestF < 0.05) continue;
          if (G.PREY[t] && !Object.keys(U).some((q) => G.PREY[t] & (1 << U[q]) && m.pop[U[q]] > 15)) continue;
          opts.push(t);
        }
        if (!opts.length) return null;
        return { r: -1, sp: opts[(rnd() * opts.length) | 0] };
      },
      dur: () => 300,
      start(ev) {
        // a foreign stock: different genes, high fertility at first (no local diseases or predators adapted to it)
        const genes = []; for (let g = 0; g < S.NG; g++) genes.push(Math.max(0, Math.min(1, 0.5 + (rnd() - 0.5) * 0.5)));
        const n = G.UNITS[ev.sp].r > 4 ? 4 + ((rnd() * 5) | 0) : 8 + ((rnd() * 10) | 0);
        const ids = S.spawnAtEdge(ev.sp, n, { genes });
        if (!ids.length) return null;
        ev.x = S.x[ids[0]]; ev.y = S.y[ids[0]]; ev.r = R().at(ev.x, ev.y); ev.rad = 60;
        modSp(ev, ev.sp, 'fert', 1.4);
        if (G.history) for (const i of ids.slice(0, 2)) G.history.notable(i, 'founder', 'fondateur d\'une population invasive');
        return { text: `Invasion : ${ids.length} ${pl(ev.sp)} venu${S.e(ev.sp)}s d'ailleurs, porteu${S.fem(ev.sp) ? 'ses' : 'rs'} de gènes différents, s'installent par ${R().name(ev.r)}. S'adapteront-ils ?`, cons: ['compétition avec les espèces locales', 'nouvelles proies ou nouveaux prédateurs', 'mélange génétique'] };
      },
      end: (ev) => (G.S.counts[ev.sp] > 0 ? `Les ${pl(ev.sp)} venu${S.e(ev.sp)}s d'ailleurs sont désormais ${G.S.counts[ev.sp]} : l'invasion est installée.` : `L'invasion des ${pl(ev.sp)} a échoué : ils ont disparu.`),
      chain: [['expansion', 0.3, 200, 400]],
    },
    {
      id: 'parasites', needWhen: true, name: 'Explosion de parasites', cat: 'biologie', icon: 'virus', sev: 2, cooldown: 200, perSpecies: true,
      when: (m, ctx) => (ctx.sp != null && m.dens[ctx.sp] > 3 && m.moist > 0.55 && m.temp > 10 && m.pop[ctx.sp] > 25 ? 0.004 : 0),
      target: (m, ctx) => ({ r: -1, sp: ctx.sp }), dur: () => between(40, 90),
      start(ev) { modSp(ev, ev.sp, 'drain', 1.35); modSp(ev, ev.sp, 'fert', 0.8); return { text: `Tiques et vers prolifèrent chez les ${pl(ev.sp)} : ils s'épuisent plus vite et font moins de petits.`, cons: ['animaux affaiblis', 'proies plus faciles'] }; },
      end: (ev) => `Les parasites des ${pl(ev.sp)} reculent.`,
      chain: [['epidemic', 0.2, 10, 40]],
    },
    {
      id: 'inbreeding', needWhen: true, name: 'Effondrement de la diversité génétique', cat: 'biologie', icon: 'dna', sev: 3, cooldown: 365, perSpecies: true,
      when: (m, ctx) => { const t = ctx.sp; return t != null && m.pop[t] >= 2 && m.pop[t] <= 14 && m.d > 100 && m.geneVar[t] < 0.006 ? 0.03 : 0; },
      target: (m, ctx) => ({ r: -1, sp: ctx.sp }), dur: () => 365,
      start(ev, m) { modSp(ev, ev.sp, 'fert', 0.7); modSp(ev, ev.sp, 'drain', 1.08); modSp(ev, ev.sp, 'mut', 3); return { text: `Les derniers ${pl(ev.sp)} (${m.pop[ev.sp]}) sont tou${S.fem(ev.sp) ? 'tes' : 's'} apparenté${S.e(ev.sp)}s : la consanguinité fragilise l'espèce.`, cons: ['fertilité en baisse', 'dérive génétique'] }; },
    },
    // ======================================================== ÉVOLUTION & HISTOIRE
    {
      id: 'adaptation', needWhen: true, name: 'Apparition d\'une adaptation', cat: 'évolution', icon: 'trend', sev: 2, cooldown: 300, perSpecies: true,
      when: (m, ctx) => (ctx.sp != null && adaptationOf(ctx.sp) ? 0.3 : 0),
      target: (m, ctx) => { const a = adaptationOf(ctx.sp); return a ? { r: -1, sp: ctx.sp, a } : null; },
      dur: () => 0,
      start(ev) {
        const { g, d } = ev.a, W = { 4: ['plus rapides', 'plus lents'], 5: ['plus grands', 'plus petits'], 6: ['à la vue plus perçante', 'à la vue moins fine'], 7: ['à la fourrure plus épaisse', 'à la fourrure plus légère'], 8: ['plus résistants aux maladies', 'moins résistants aux maladies'], 1: ['plus téméraires', 'plus craintifs'] }[g];
        if (G.history) G.history.speciesTrait(ev.sp, `${d > 0 ? W[0] : W[1]} (an ${Math.floor(S.time / G.DAY / 364) + 1})`);
        return { text: `Adaptation : en un an, les ${pl(ev.sp)} sont devenu${S.e(ev.sp)}s ${d > 0 ? W[0] : W[1]} (${d > 0 ? '+' : ''}${Math.round(d * 100)} points). La sélection naturelle est à l'œuvre.`, cons: ['nouvel équilibre prédateurs / proies'] };
      },
    },
    {
      id: 'divergence', needWhen: true, name: 'Divergence de populations', cat: 'évolution', icon: 'dna', sev: 2, cooldown: 500, perSpecies: true,
      when: (m, ctx) => (ctx.sp != null && m.d > 300 && S.genRec[ctx.sp] >= 5 && divergenceOf(ctx.sp) ? 0.15 : 0),
      target: (m, ctx) => { const dv = divergenceOf(ctx.sp); return dv ? Object.assign(regionTarget(dv.a), { sp: ctx.sp, dv }) : null; },
      dur: () => 0,
      start(ev) {
        const { a, b, g, d } = ev.dv, gn = ['vitesse', 'taille', 'vue', 'fourrure', 'immunité'][g];
        if (G.history) G.history.speciesTrait(ev.sp, `deux populations distinctes : ${R().name(a)} / ${R().name(b)} (${gn})`);
        return { text: `Les ${pl(ev.sp)} ${R().de(a)} et ${S.fem(ev.sp) ? 'celles' : 'ceux'} ${R().de(b)} divergent : leur ${gn} diffère désormais nettement (${Math.round(d * 100)} points).`, cons: ['deux populations', 'mélange si elles se rencontrent'] };
      },
    },
    {
      id: 'recolonisation', name: 'Recolonisation d\'une région', cat: 'évolution', icon: 'compass', sev: 1, cooldown: 60, perSpecies: true, forcedOnly: true,
      when: () => 0, target: (m, ctx) => Object.assign(regionTarget(ctx.r), { sp: ctx.sp }), dur: () => 0,
      start: (ev) => ({ text: `Les ${pl(ev.sp)} sont de retour dans ${R().name(ev.r)}, qu'${S.fem(ev.sp) ? 'elles' : 'ils'} avaient désertée.`, cons: ['territoire reconquis'] }),
    },
    {
      id: 'massMigration', name: 'Migration exceptionnelle', cat: 'évolution', icon: 'foot', sev: 2, cooldown: 90, perSpecies: true,
      when: (m, ctx) => { const t = ctx.sp; return t != null && G.migration && G.migration.isMigratory(t) && m.pop[t] >= 20 && (m.d % 91 < 3) ? 0.5 : 0; },
      target: (m, ctx) => ({ r: -1, sp: ctx.sp }), dur: () => 0,
      start(ev) {
        const res = ev.ctx && ev.ctx.report ? ev.ctx.report : migrate('seasonal', ev.sp);
        if (!res || !res.n) return null;
        ev.r = res.to; [ev.x, ev.y] = R().center(res.to); ev.rad = R().radius();
        return { text: `Grande migration : ${res.n} ${pl(ev.sp)} quittent ${R().name(res.from)} pour ${R().name(res.to)} (${res.why}).`, cons: ['territoires redistribués', 'prédateurs qui suivent', 'brassage génétique'] };
      },
    },
    {
      id: 'regionalExtinction', name: 'Extinction régionale', cat: 'évolution', icon: 'skull', sev: 1, cooldown: 120, perSpecies: true, forcedOnly: true,
      when: () => 0, target: (m, ctx) => Object.assign(regionTarget(ctx.r), { sp: ctx.sp }), dur: () => 0,
      start: (ev) => ({ text: `Plus ${S.fem(ev.sp) ? 'aucune' : 'aucun'} ${name(ev.sp)} dans ${R().name(ev.r)}.`, cons: ['territoire libéré'] }),
    },
    {
      id: 'renewal', name: 'Renaissance d\'un écosystème', cat: 'évolution', icon: 'sprout', sev: 2, cooldown: 200, chainOnly: true,
      when: () => 0,
      target(m, ctx) {
        // recovered when vegetation and diversity are back (checked again later otherwise)
        const r = ctx.r != null && ctx.r >= 0 ? ctx.r : bestRegion((r) => st().veg[r]);
        if (st().veg[r] < 0.55 || st().burnt[r] > st().cells[r] * 0.05) return null;
        return regionTarget(r);
      },
      dur: () => 0,
      start: (ev, m) => ({ text: `${R().name(ev.r)[0].toUpperCase() + R().name(ev.r).slice(1)} renaît : la végétation a repoussé et ${m.nSpecies} espèces peuplent la vallée.`, cons: ['retour de la faune', 'nouvelle forêt pionnière'] }),
    },
  ];

  // ------------------------------------------------ helpers reading the genetic history
  // a gene whose species mean moved by ≥ 0.07 in a year
  function adaptationOf(t) {
    const gh = S.geneHist, NG = S.NG;
    if (!gh || gh.length < 30) return null;
    const now = gh[gh.length - 1];
    let old = null;
    for (let k = gh.length - 1; k >= 0; k--) if (now.t - gh[k].t >= 330) { old = gh[k]; break; }
    if (!old || now.n[t] < 15 || old.n[t] < 10) return null;
    let best = null;
    for (const g of [4, 5, 6, 7, 8, 1]) { const d = now.m[t * NG + g] - old.m[t * NG + g]; if (Math.abs(d) >= 0.07 && (!best || Math.abs(d) > Math.abs(best.d))) best = { g, d }; }
    return best;
  }
  // two regions whose populations differ clearly on one physical gene
  function divergenceOf(t) {
    const s = st(); if (!s) return null;
    const NS_ = G.NSP, NGR = R().NGR;
    let best = null;
    for (let a = 0; a < R().NR; a++) for (let b = a + 1; b < R().NR; b++) {
      if (s.pop[a * NS_ + t] < 8 || s.pop[b * NS_ + t] < 8) continue;
      for (let g = 0; g < NGR; g++) { const d = s.genes[(a * NS_ + t) * NGR + g] - s.genes[(b * NS_ + t) * NGR + g]; if (Math.abs(d) > 0.12 && (!best || Math.abs(d) > Math.abs(best.d))) best = { a, b, g, d: Math.abs(d) }; }
    }
    return best;
  }
  G.EVENTS = E;
  G.EVENT = {}; for (const e of E) G.EVENT[e.id] = e;
  G.events = { animalSp, modSp };
})();
