'use strict';
// ============================================================================
//  Definitions: world constants, terrain (plants), species
//  Time unit for biology: the in-game DAY (G.DAY seconds of simulation).
// ============================================================================
const G = (window.G = {});

G.DT = 1 / 30;          // fixed simulation step (s)
G.DAY = 60;             // one in-game day = 60 s of simulation at ×1
G.SEASON_DAYS = 4;      // 4 days per season, 16 days per year
G.TC = 8;               // terrain / vegetation cell (world units)
G.GC = 16;              // spatial grid cell
G.MAXU = 60000;
G.MAXFX = 40000;

// ---------------------------------------------------------------- flags
const F = (G.F = {
  STATIC: 1, AIR: 2, BUILD: 4, NEUTRAL: 8, HIDDEN: 16, HERD: 32, PACK: 64, FIGHT: 128,
  STALK: 256, HIBERNATE: 512, ARBOREAL: 1024, DIMORPH: 2048, NAIVE: 4096, SMALL: 8192,
  CARCASS: 16384, HIVE: 32768, MAGIC: 65536,
});
// habitats
const HB = (G.HB = { LAND: 0, WATER: 1, AMPHI: 2, SHORE: 3, AIR: 4, DEEP: 5 });
// diet bits
const D = (G.D = {
  GRASS: 1, BROWSE: 2, SEED: 4, NUTS: 8, BERRY: 16, FLOWER: 32, ALGAE: 64, WATERPLANT: 128,
  BARK: 256, MEAT: 512, CARRION: 1024, HONEY: 2048, NECTAR: 4096, INSECT: 8192, FISH: 16384,
});

// ---------------------------------------------------------------- terrain / plants
// lush / bare: ground colour with full / no vegetation. grow: vegetation regrowth per day.
const T = (G.T = {});
G.TERRAIN = [
  { k: 'GRASS',   name: 'Prairie',          lush: [170, 214, 120], bare: [216, 206, 160], grow: 0.9,  spd: 1.0,  fuel: 1.2, spread: 0.6, desc: 'Herbe qui repousse. Broutée par lapins, cerfs, bisons… Surpâturée, elle devient terre nue.' },
  { k: 'TALL',    name: 'Hautes herbes',    lush: [152, 200, 92],  bare: [208, 198, 140], grow: 0.8,  spd: 0.8,  fuel: 2.2, spread: 1.4, desc: 'Cachette des souris et des lapins. Très inflammable en été.' },
  { k: 'FLOWERS', name: 'Fleurs',           lush: [182, 216, 132], bare: [214, 206, 162], grow: 0.7,  spd: 1.0,  fuel: 1.2, spread: 0.6, desc: 'Nectar pour abeilles et papillons. Pollinisées, elles se répandent.' },
  { k: 'BUSH',    name: 'Buissons à baies', lush: [138, 190, 100], bare: [196, 188, 140], grow: 0.35, spd: 0.6,  fuel: 4,   spread: 0.5, desc: 'Baies en été et en automne : ours, renards, sangliers, corbeaux.' },
  { k: 'FOREST',  name: 'Forêt',            lush: [118, 176, 96],  bare: [160, 156, 116], grow: 0.4,  spd: 0.6,  fuel: 9,   spread: 0.4, desc: 'Noix et abri. Les écureuils y plantent de nouveaux arbres, les castors les abattent.' },
  { k: 'SAND',    name: 'Sable',            lush: [242, 226, 172], bare: [242, 226, 172], grow: 0,    spd: 0.85, desc: 'Plage stérile.' },
  { k: 'MUD',     name: 'Boue',             lush: [178, 148, 110], bare: [178, 148, 110], grow: 0.1,  spd: 0.5,  desc: 'Les sangliers adorent s\'y rouler.' },
  { k: 'ROCK',    name: 'Rochers',          lush: [198, 194, 188], bare: [198, 194, 188], grow: 0,    spd: 0,    block: 1, desc: 'Infranchissable au sol.' },
  { k: 'DIRT',    name: 'Terre nue',        lush: [206, 184, 142], bare: [206, 184, 142], grow: 0.15, spd: 1,    desc: 'Sol à nu : l\'herbe finit par la recoloniser.' },
  { k: 'BURNT',   name: 'Cendres',          lush: [134, 126, 116], bare: [134, 126, 116], grow: 0.25, spd: 1 },
  { k: 'REEDS',   name: 'Roseaux',          lush: [126, 196, 186], bare: [150, 196, 210], grow: 0.8,  spd: 0.5,  water: 1, desc: 'Berge marécageuse : canards, grenouilles, hérons.' },
  { k: 'WATER',   name: 'Eau',              lush: [132, 202, 238], bare: [132, 202, 238], grow: 0.6,  spd: 0.4,  water: 1, desc: 'Abreuvoir et algues pour les poissons. Les animaux terrestres y pataugent lentement.' },
  { k: 'DEEP',    name: 'Eau profonde',     lush: [74, 154, 218],  bare: [74, 154, 218],  grow: 0.4,  spd: 0.25, water: 1, block: 2, desc: 'Lac ou rivière profonde : infranchissable pour les animaux terrestres.' },
];
G.TERRAIN.forEach((t, i) => (T[t.k] = i));

// ---------------------------------------------------------------- species
// r: radius, spd: walk, run: sprint (world/s), vis: vision, hp,
// mature / gest / life / hunger / thirst in days, litter [min,max],
// meat: carcass food value, chase: max sprint seconds when hunting, stamina: max flee sprint seconds
const SPECIES = [
  // ------------------------------------------------------------ herbivores
  { k: 'rabbit', name: 'Lapin', cat: 'herb', r: 2.6, spd: 14, run: 60, vis: 75, hp: 8, diet: D.GRASS | D.FLOWER | D.SEED, hab: HB.LAND, flags: F.SMALL, active: 'crep',
    breed: [0, 1], bcd: 1.6, mature: 1.8, gest: 0.5, litter: [2, 5], life: 12, hunger: 1.4, thirst: 2.5, meat: 0.4, stamina: 4,
    desc: 'Se reproduit à toute vitesse. Proie du renard, du loup, du lynx, de l\'aigle et du hibou.' },
  { k: 'mouse', name: 'Souris', cat: 'herb', r: 1.6, spd: 10, run: 42, vis: 45, hp: 3, diet: D.SEED | D.GRASS, hab: HB.LAND, flags: F.SMALL, active: 'night',
    breed: [0, 1, 2], bcd: 1.2, mature: 1.2, gest: 0.4, litter: [3, 6], life: 7, hunger: 1, thirst: 3, meat: 0.15, stamina: 3,
    desc: 'Grignote les graines la nuit. Repas favori des hiboux et des renards.' },
  { k: 'squirrel', name: 'Écureuil', cat: 'herb', r: 2.2, spd: 16, run: 52, vis: 75, hp: 6, diet: D.NUTS | D.BERRY | D.SEED, hab: HB.LAND, flags: F.SMALL | F.ARBOREAL, active: 'day',
    breed: [0, 1], bcd: 3, mature: 3, gest: 0.8, litter: [2, 4], life: 20, hunger: 1.6, thirst: 3, meat: 0.25, stamina: 4,
    desc: 'Vit en forêt. Oublie ses noix enterrées… qui deviennent de nouveaux arbres.' },
  { k: 'deer', name: 'Cerf', cat: 'herb', r: 5, spd: 16, run: 68, vis: 130, hp: 70, diet: D.GRASS | D.BROWSE | D.BERRY, hab: HB.LAND, flags: F.HERD | F.DIMORPH, active: 'any',
    breed: [2], bcd: 12, mature: 6, gest: 7, litter: [1, 2], life: 80, hunger: 2.4, thirst: 2, meat: 3, stamina: 6,
    desc: 'Vit en harde et fuit au moindre danger. À l\'automne, les mâles s\'affrontent : c\'est le brame.' },
  { k: 'boar', name: 'Sanglier', cat: 'herb', r: 4.8, spd: 14, run: 50, vis: 90, hp: 110, diet: D.GRASS | D.BERRY | D.NUTS | D.CARRION, hab: HB.LAND, flags: F.HERD | F.FIGHT, active: 'night',
    breed: [2, 3], bcd: 12, mature: 5, gest: 5, litter: [2, 5], life: 64, hunger: 2, thirst: 2, meat: 3, stamina: 5,
    desc: 'Omnivore qui retourne la terre. Charge les prédateurs pour défendre ses marcassins.' },
  { k: 'bison', name: 'Bison', cat: 'herb', r: 8, spd: 12, run: 46, vis: 110, hp: 320, diet: D.GRASS, hab: HB.LAND, flags: F.HERD | F.FIGHT, active: 'any',
    breed: [1], bcd: 12, mature: 8, gest: 9, litter: [1, 1], life: 100, hunger: 3, thirst: 2, meat: 8, stamina: 6,
    desc: 'Grand troupeau qui fait front face aux loups. Broute énormément.' },
  { k: 'beaver', name: 'Castor', cat: 'herb', r: 3.6, spd: 10, run: 28, vis: 90, hp: 28, diet: D.BARK | D.WATERPLANT, hab: HB.AMPHI, flags: 0, active: 'night',
    breed: [3], bcd: 12, mature: 5, gest: 4, litter: [1, 3], life: 64, hunger: 2, thirst: 99, meat: 1, stamina: 3,
    desc: 'Abat les arbres près de l\'eau et construit des barrages qui créent des étangs.' },
  // ------------------------------------------------------------ predators
  { k: 'fox', name: 'Renard', cat: 'pred', r: 3.4, spd: 18, run: 64, vis: 120, hp: 30, diet: D.MEAT | D.CARRION | D.BERRY, hab: HB.LAND, flags: 0, active: 'night',
    prey: ['rabbit', 'mouse', 'squirrel', 'duck', 'frog', 'dodo'], breed: [3], bcd: 12, mature: 4, gest: 2, litter: [2, 4], life: 48, hunger: 2, thirst: 2, meat: 1, chase: 3.5, stamina: 5,
    desc: 'Chasseur rusé et opportuniste : petits mammifères, canards, baies et charognes.' },
  { k: 'wolf', name: 'Loup', cat: 'pred', r: 4.6, spd: 20, run: 70, vis: 170, hp: 90, diet: D.MEAT | D.CARRION, hab: HB.LAND, flags: F.PACK, active: 'any',
    prey: ['deer', 'rabbit', 'boar', 'bison', 'beaver', 'dodo'], breed: [3], bcd: 12, mature: 7, gest: 2.5, litter: [2, 5], life: 80, hunger: 3, thirst: 2, meat: 2, chase: 7, stamina: 8,
    desc: 'Chasse en meute et épuise ses proies. Hurle les nuits de pleine lune.' },
  { k: 'lynx', name: 'Lynx', cat: 'pred', r: 4, spd: 14, run: 72, vis: 120, hp: 60, diet: D.MEAT, hab: HB.LAND, flags: F.STALK, active: 'crep',
    prey: ['rabbit', 'squirrel', 'deer', 'mouse', 'duck'], breed: [3], bcd: 12, mature: 6, gest: 2.5, litter: [1, 3], life: 64, hunger: 3, thirst: 2, meat: 1.5, chase: 2.5, stamina: 3,
    desc: 'S\'approche à pas de loup puis bondit. Préfère la forêt.' },
  { k: 'bear', name: 'Ours', cat: 'pred', r: 7.5, spd: 12, run: 52, vis: 120, hp: 420, diet: D.BERRY | D.FISH | D.HONEY | D.CARRION | D.MEAT | D.NUTS, hab: HB.LAND, flags: F.HIBERNATE | F.FIGHT, active: 'day',
    prey: ['fish', 'deer', 'boar'], breed: [1], bcd: 28, mature: 10, gest: 8, litter: [1, 2], life: 120, hunger: 4, thirst: 2, meat: 6, chase: 3, stamina: 4,
    desc: 'Omnivore : baies, poissons pêchés dans la rivière, miel des ruches, charognes. Hiberne l\'hiver.' },
  // ------------------------------------------------------------ birds
  { k: 'eagle', name: 'Aigle', cat: 'bird', r: 4, spd: 34, run: 110, vis: 210, hp: 30, diet: D.MEAT | D.CARRION, hab: HB.AIR, flags: F.AIR, active: 'day', alt: 44,
    prey: ['rabbit', 'mouse', 'squirrel', 'fish', 'duck'], breed: [0], bcd: 12, mature: 8, gest: 1.5, litter: [1, 2], life: 100, hunger: 3, thirst: 3, meat: 0.5, chase: 4, stamina: 6,
    desc: 'Plane très haut et pique sur lapins, poissons et canards.' },
  { k: 'owl', name: 'Hibou', cat: 'bird', r: 3, spd: 26, run: 80, vis: 150, hp: 16, diet: D.MEAT, hab: HB.AIR, flags: F.AIR, active: 'night', alt: 26,
    prey: ['mouse', 'rabbit', 'frog', 'squirrel'], breed: [3, 0], bcd: 12, mature: 5, gest: 1, litter: [2, 3], life: 64, hunger: 2, thirst: 3, meat: 0.3, chase: 3, stamina: 5,
    desc: 'Chasseur nocturne silencieux qui régule les souris.' },
  { k: 'vulture', name: 'Vautour', cat: 'bird', r: 5, spd: 28, run: 50, vis: 420, hp: 30, diet: D.CARRION, hab: HB.AIR, flags: F.AIR, active: 'day', alt: 56,
    breed: [0], bcd: 12, mature: 8, gest: 1.5, litter: [1, 1], life: 100, hunger: 4, thirst: 3, meat: 0.5, stamina: 9,
    desc: 'Tourne en cercle et repère les carcasses de très loin. Le nettoyeur de la nature.' },
  { k: 'crow', name: 'Corbeau', cat: 'bird', r: 2.8, spd: 26, run: 50, vis: 160, hp: 10, diet: D.CARRION | D.SEED | D.BERRY, hab: HB.AIR, flags: F.AIR | F.HERD, active: 'day', alt: 20,
    breed: [0], bcd: 12, mature: 3, gest: 1, litter: [2, 4], life: 56, hunger: 1.5, thirst: 3, meat: 0.2, stamina: 6,
    desc: 'Malin et opportuniste. Attention aux renards flatteurs…' },
  { k: 'duck', name: 'Canard', cat: 'bird', r: 2.8, spd: 10, run: 40, vis: 80, hp: 10, diet: D.WATERPLANT | D.ALGAE | D.SEED, hab: HB.AMPHI, flags: F.HERD, active: 'day',
    breed: [0], bcd: 12, mature: 3, gest: 1, litter: [3, 7], life: 48, hunger: 1.5, thirst: 99, meat: 0.4, stamina: 4,
    desc: 'Nage en famille, les canetons suivent leur mère en file indienne.' },
  { k: 'heron', name: 'Héron', cat: 'bird', r: 3.5, spd: 9, run: 38, vis: 100, hp: 22, diet: D.FISH | D.MEAT, hab: HB.SHORE, flags: F.STALK, active: 'day',
    prey: ['fish', 'frog', 'mouse'], breed: [0], bcd: 12, mature: 5, gest: 1.2, litter: [2, 3], life: 64, hunger: 2, thirst: 99, meat: 0.4, chase: 1.5, stamina: 3,
    desc: 'Immobile dans l\'eau peu profonde, il harponne poissons et grenouilles.' },
  // ------------------------------------------------------------ water & tiny
  { k: 'fish', name: 'Poisson', cat: 'water', r: 2, spd: 12, run: 38, vis: 45, hp: 4, diet: D.ALGAE, hab: HB.WATER, flags: F.HERD | F.SMALL, active: 'any',
    breed: [0], bcd: 12, mature: 2, gest: 0.6, litter: [6, 14], life: 40, hunger: 2, thirst: 99, meat: 0.3, stamina: 4,
    desc: 'Vit en banc et se nourrit d\'algues. Pêché par l\'ours, le héron et l\'aigle.' },
  { k: 'frog', name: 'Grenouille', cat: 'water', r: 1.8, spd: 6, run: 30, vis: 45, hp: 4, diet: D.INSECT, hab: HB.SHORE, flags: F.SMALL | F.HIBERNATE, active: 'night',
    prey: ['bee', 'butterfly'], breed: [0], bcd: 12, mature: 2, gest: 0.6, litter: [6, 14], life: 40, hunger: 3, thirst: 99, meat: 0.15, chase: 0.8, stamina: 2,
    desc: 'Coasse la nuit près de l\'eau et gobe les insectes qui passent.' },
  { k: 'bee', name: 'Abeille', cat: 'water', r: 1, spd: 26, run: 30, vis: 140, hp: 1, diet: D.NECTAR, hab: HB.AIR, flags: F.AIR | F.SMALL, active: 'day', alt: 7,
    mature: 99, gest: 99, litter: [0, 0], life: 4, hunger: 99, thirst: 99, meat: 0, stamina: 9,
    desc: 'Butine les fleurs, rapporte le miel à la ruche et pollinise : les fleurs se répandent.' },
  { k: 'butterfly', name: 'Papillon', cat: 'water', r: 1.4, spd: 14, run: 20, vis: 100, hp: 1, diet: D.NECTAR, hab: HB.AIR, flags: F.AIR | F.SMALL, active: 'day', alt: 9,
    breed: [0, 1], bcd: 1, mature: 1, gest: 0.5, litter: [1, 3], life: 5, hunger: 1, thirst: 99, meat: 0, stamina: 9,
    desc: 'Volète de fleur en fleur et pond sur les prairies fleuries.' },
  // ------------------------------------------------------------ structures
  { k: 'hive', name: 'Ruche', cat: 'struct', r: 3.5, spd: 0, vis: 0, hp: 40, diet: 0, hab: HB.LAND, flags: F.STATIC | F.BUILD | F.HIVE, active: 'any',
    mature: 99, gest: 99, litter: [0, 0], life: 99999, hunger: 99, thirst: 99, meat: 0,
    desc: 'Produit des abeilles tant qu\'il y a des fleurs. Les ours raffolent de son miel.' },
  { k: 'carcass', name: 'Carcasse', cat: 'struct', r: 3, spd: 0, vis: 0, hp: 1, diet: 0, hab: HB.LAND, flags: F.STATIC | F.CARCASS, active: 'any',
    mature: 99, gest: 99, litter: [0, 0], life: 99999, hunger: 99, thirst: 99, meat: 0, desc: '' },
  // ------------------------------------------------------------ secrets
  { k: 'unicorn', name: 'Licorne', cat: 'secret', r: 5, spd: 16, run: 80, vis: 140, hp: 500, diet: D.FLOWER | D.GRASS, hab: HB.LAND, flags: F.HIDDEN | F.MAGIC, active: 'any',
    mature: 99, gest: 99, litter: [0, 0], life: 6, hunger: 99, thirst: 99, meat: 0, stamina: 9, desc: 'On raconte qu\'elle n\'apparaît que dans les écosystèmes parfaitement équilibrés.' },
  { k: 'nessie', name: 'Nessie', cat: 'secret', r: 9, spd: 8, run: 20, vis: 60, hp: 99999, diet: D.ALGAE, hab: HB.DEEP, flags: F.HIDDEN | F.MAGIC, active: 'any',
    mature: 99, gest: 99, litter: [0, 0], life: 99999, hunger: 99, thirst: 99, meat: 0, stamina: 9, desc: 'Personne ne l\'a jamais vraiment vue.' },
  { k: 'bigfoot', name: 'Bigfoot', cat: 'secret', r: 6, spd: 15, run: 40, vis: 100, hp: 99999, diet: D.BERRY, hab: HB.LAND, flags: F.HIDDEN | F.MAGIC, active: 'any',
    mature: 99, gest: 99, litter: [0, 0], life: 0.6, hunger: 99, thirst: 99, meat: 0, stamina: 9, desc: 'Photo floue garantie.' },
  { k: 'dodo', name: 'Dodo', cat: 'secret', r: 3.4, spd: 7, run: 9, vis: 30, hp: 6, diet: D.GRASS | D.BERRY | D.SEED, hab: HB.LAND, flags: F.HIDDEN | F.NAIVE, active: 'day',
    mature: 4, gest: 1.5, litter: [1, 1], life: 25, hunger: 2, thirst: 3, meat: 1.5, stamina: 1, desc: 'Éteint depuis 1681. Il ne sait toujours pas fuir.' },
];
G.UNITS = SPECIES;
G.U = {};
SPECIES.forEach((u, i) => { u.id = i; G.U[u.k] = i; });
const NSP = SPECIES.length;
G.NSP = NSP;
G.UR = new Float32Array(NSP); G.USPD = new Float32Array(NSP); G.URUN = new Float32Array(NSP); G.UVIS = new Float32Array(NSP);
G.UHP = new Float32Array(NSP); G.UFL = new Int32Array(NSP); G.UDIET = new Int32Array(NSP); G.UHAB = new Uint8Array(NSP);
G.UALT = new Float32Array(NSP); G.UMASS = new Float32Array(NSP);
G.PREY = new Uint32Array(NSP);   // bitmask of species this one hunts
G.PRED = new Uint32Array(NSP);   // bitmask of species that hunt this one
SPECIES.forEach((u, i) => {
  G.UR[i] = u.r; G.USPD[i] = u.spd; G.URUN[i] = u.run || u.spd; G.UVIS[i] = u.vis; G.UHP[i] = u.hp;
  G.UFL[i] = u.flags | (u.hab === HB.AIR ? F.AIR : 0); G.UDIET[i] = u.diet; G.UHAB[i] = u.hab; G.UALT[i] = u.alt || 0;
  G.UMASS[i] = u.flags & F.STATIC ? 1000 : u.r * u.r;
});
SPECIES.forEach((u, i) => {
  for (const p of u.prey || []) { const j = G.U[p]; G.PREY[i] |= 1 << j; G.PRED[j] |= 1 << i; }
});

// food value (0..1) of a terrain type for a diet
G.FOOD = new Float32Array(NSP * G.TERRAIN.length);
SPECIES.forEach((u, i) => {
  const d = u.diet;
  G.TERRAIN.forEach((t, tt) => {
    let v = 0;
    if (d & D.GRASS && (tt === T.GRASS || tt === T.TALL || tt === T.FLOWERS)) v = Math.max(v, 1);
    if (d & D.SEED && (tt === T.TALL || tt === T.FLOWERS || tt === T.GRASS)) v = Math.max(v, tt === T.GRASS ? 0.5 : 1);
    if (d & D.FLOWER && tt === T.FLOWERS) v = Math.max(v, 1);
    if (d & D.BROWSE && (tt === T.BUSH || tt === T.FOREST)) v = Math.max(v, 0.7);
    if (d & D.BERRY && tt === T.BUSH) v = Math.max(v, 1);
    if (d & D.NUTS && tt === T.FOREST) v = Math.max(v, 1);
    if (d & D.ALGAE && (tt === T.WATER || tt === T.DEEP || tt === T.REEDS)) v = Math.max(v, 1);
    if (d & D.WATERPLANT && (tt === T.REEDS || tt === T.WATER)) v = Math.max(v, 1);
    if (d & D.BARK && tt === T.FOREST) v = Math.max(v, 1);
    if (d & D.NECTAR && tt === T.FLOWERS) v = Math.max(v, 1);
    G.FOOD[i * G.TERRAIN.length + tt] = v;
  });
});

// first names for the magnifier (and a few literary classics)
G.NAMES = ['Léon', 'Margot', 'Pistache', 'Noisette', 'Gaston', 'Capucine', 'Biscotte', 'Hector', 'Praline', 'Félix', 'Rosalie', 'Tartine',
  'Gribouille', 'Pompon', 'Basile', 'Clémentine', 'Moustache', 'Plume', 'Caramel', 'Edmond', 'Lulu', 'Ficelle', 'Barnabé', 'Olga', 'Cachou',
  'Igor', 'Myrtille', 'Prosper', 'Zélie', 'Anatole', 'Victor', 'Suzon', 'Pépite', 'Marius', 'Bérénice', 'Grignotte', 'Fernand', 'Pâquerette'];
G.SPECIAL_NAMES = { fox: 'Renart', wolf: 'Ysengrin', bear: 'Martin', crow: 'Maître Corbeau', rabbit: 'Jeannot', owl: 'Grand-Duc', frog: 'Prince charmant', heron: 'Long-Bec', beaver: 'Castor junior' };
