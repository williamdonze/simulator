'use strict';
// ============================================================================
//  Definitions: world constants, terrain types, unit / building types
// ============================================================================
const G = (window.G = {});

G.DT = 1 / 30;            // fixed simulation step
G.TC = 8;                 // terrain cell size (world units)
G.GC = 16;                // spatial grid / flow-field cell size
G.MAXU = 100000;          // max units + buildings
G.MAXP = 40000;           // max projectiles
G.MAXFX = 60000;          // max particles
G.NT = 5;                 // 4 teams + neutral
G.NEUTRAL = 4;

G.TEAM_RGB = [
  [222, 58, 52],   // rouge
  [52, 112, 240],  // bleu
  [60, 182, 78],   // vert
  [240, 196, 40],  // jaune
  [150, 150, 150], // neutre
];
G.TEAM_NAMES = ['Rouge', 'Bleu', 'Vert', 'Jaune', 'Neutre'];

// ---------------------------------------------------------------- flags
const F = (G.F = {
  BUILD: 1, STATIC: 2, BRAVE: 4, COWARD: 8, KITE: 16, SHIELD: 32, CLEAVE: 64,
  BERSERK: 128, ANTICAV: 256, MOUNTED: 512, DODGE: 1024, PICKY: 2048, SIEGE: 4096,
  AURA: 8192, KING: 16384, EXPLODE: 32768, FLAMMABLE: 65536, REPAIR: 1 << 17,
  HEALAURA: 1 << 18, AP: 1 << 19, NEUTRAL: 1 << 20, PREFBUILD: 1 << 21,
  ONLYBUILD: 1 << 22, LIFESTEAL: 1 << 23, FIREPROOF: 1 << 24, MOVESHOOT: 1 << 25,
});

// behaviours
const B = (G.B = { MELEE: 0, RANGED: 1, CAV: 2, HEAL: 3, SUPPORT: 4, NINJA: 5, SAPPER: 6, RAM: 7, BUILD: 8, PROP: 9 });
// projectiles
const P = (G.P = { NONE: 0, ARROW: 1, BOLT: 2, BULLET: 3, GRENADE: 4, FIREBALL: 5, FLAME: 6, STONE: 7, BBOLT: 8, CANNON: 9, SHURIKEN: 10, JAVELIN: 11 });

// ---------------------------------------------------------------- terrain
// block: 0 = walkable, 1 = solid (blocks units & straight shots), 2 = blocks units only
const T = (G.T = {});
G.TERRAIN = [
  { k: 'GRASS',    name: 'Prairie',        col: [246, 246, 240],  spd: 1.0,  block: 0, fuel: 0,   spread: 0 },
  { k: 'TALL',     name: 'Herbes hautes',  col: [214, 228, 150],  spd: 0.85, block: 0, fuel: 2.2, spread: 1.6, tool: true, desc: 'Très inflammable : le feu s\'y propage à toute vitesse.' },
  { k: 'FOREST',   name: 'Forêt',          col: [176, 214, 140],   spd: 0.55, block: 0, fuel: 9,   spread: 0.45, tool: true, desc: 'Ralentit les troupes, arrête 35 % des tirs tendus. Brûle longtemps.' },
  { k: 'WATER',    name: 'Eau peu profonde', col: [140, 206, 240], spd: 0.45, block: 0, fuel: 0,  spread: 0, water: 1, tool: true, desc: 'Ralentit fortement et éteint les unités en feu.' },
  { k: 'DEEP',     name: 'Eau profonde',   col: [80, 160, 222],   spd: 0.3,  block: 2, fuel: 0,   spread: 0, water: 1, tool: true, desc: 'Infranchissable à pied. Les projectiles passent au-dessus.' },
  { k: 'MUD',      name: 'Boue',           col: [200, 166, 122],   spd: 0.45, block: 0, fuel: 0,   spread: 0, tool: true, desc: 'Englue les troupes, surtout la cavalerie.' },
  { k: 'SAND',     name: 'Sable',          col: [245, 226, 166], spd: 0.8,  block: 0, fuel: 0,   spread: 0, tool: true, desc: 'Léger ralentissement.' },
  { k: 'ROAD',     name: 'Route',          col: [228, 216, 190], spd: 1.4,  block: 0, fuel: 0,   spread: 0, tool: true, desc: 'Les troupes y marchent 40 % plus vite.' },
  { k: 'ROCK',     name: 'Rochers',        col: [214, 210, 202], spd: 0,    block: 1, fuel: 0,   spread: 0, tool: true, desc: 'Obstacle indestructible, bloque les tirs tendus.' },
  { k: 'WALL',     name: 'Mur de pierre',  col: [206, 200, 190], spd: 0,    block: 1, fuel: 0,   spread: 0, hp: 700, tool: true, desc: 'Bloque tout. Les troupes le contournent… ou le démolissent. Les explosions le détruisent.' },
  { k: 'PALI',     name: 'Palissade',      col: [224, 204, 170],   spd: 0,    block: 1, fuel: 12,  spread: 0.3, hp: 260, tool: true, desc: 'Mur en bois, moins solide et inflammable.' },
  { k: 'SPIKES',   name: 'Pieux / pièges', col: [236, 230, 208],  spd: 0.6,  block: 0, fuel: 0,   spread: 0, tool: true, desc: 'Blessent toute unité qui les traverse.' },
  { k: 'BURNT',    name: 'Cendres',        col: [170, 160, 148],    spd: 1.0,  block: 0, fuel: 0,   spread: 0 },
  { k: 'RUBBLE',   name: 'Gravats',        col: [214, 206, 192], spd: 0.7,  block: 0, fuel: 0,   spread: 0 },
];
G.TERRAIN.forEach((t, i) => (T[t.k] = i));

// ---------------------------------------------------------------- units
// r: radius, spd: world units/s, hp, arm: flat armor, dmg, reach (melee range beyond contact),
// rng: shooting range, minr: min range, cd: seconds between attacks, vis: vision radius
const UNITS = [
  // ------------------------------------------------------------- ARMÉE
  { k: 'peasant', name: 'Paysan', cat: 'army', r: 4, spd: 40, hp: 45, arm: 0, dmg: 6, reach: 2, cd: 1.0, vis: 170, beh: B.MELEE, flags: F.COWARD | F.REPAIR,
    look: { tunic: 1, pants: '#6b5537', helmet: 'straw', weapon: 'fork' },
    desc: 'Faible et peureux : fuit quand il est en infériorité. Répare les bâtiments alliés endommagés.' },
  { k: 'soldier', name: 'Fantassin', cat: 'army', r: 4.5, spd: 42, hp: 110, arm: 1, dmg: 13, reach: 2.5, cd: 0.9, vis: 180, beh: B.MELEE, flags: 0,
    look: { tunic: 1, helmet: 'kettle', weapon: 'sword', shield: 'small' },
    desc: 'Épéiste polyvalent. Peut fuir s\'il est submergé et blessé.' },
  { k: 'spear', name: 'Lancier', cat: 'army', r: 4.5, spd: 40, hp: 105, arm: 1, dmg: 11, reach: 9, cd: 1.0, vis: 180, beh: B.MELEE, flags: F.ANTICAV,
    look: { tunic: 1, helmet: 'kettle', weapon: 'spear' },
    desc: 'Longue allonge. Dégâts ×3 contre la cavalerie et brise les charges (étourdit le cavalier).' },
  { k: 'shield', name: 'Bouclier', cat: 'army', r: 5, spd: 30, hp: 190, arm: 3, dmg: 8, reach: 2.5, cd: 1.1, vis: 170, beh: B.MELEE, flags: F.SHIELD | F.BRAVE,
    look: { tunic: 1, armor: '#8d969e', helmet: 'great', weapon: 'sword', shield: 'tower' },
    desc: 'Pavois géant : bloque 85 % des projectiles venant de face et protège ceux qui sont derrière.' },
  { k: 'knight', name: 'Chevalier', cat: 'army', r: 5, spd: 32, hp: 280, arm: 6, dmg: 22, reach: 3, cd: 1.1, vis: 180, beh: B.MELEE, flags: F.BRAVE,
    look: { tunic: 1, armor: '#b8c0c8', helmet: 'great', weapon: 'sword', shield: 'kite', plume: 1 },
    desc: 'Armure lourde (−6 dégâts par coup). Ne fuit jamais.' },
  { k: 'barbarian', name: 'Barbare', cat: 'army', r: 5, spd: 46, hp: 160, arm: 0, dmg: 24, reach: 4, cd: 1.3, vis: 190, beh: B.MELEE, flags: F.CLEAVE | F.BRAVE,
    look: { tunic: 1, skin: '#e0a37a', helmet: 'horn', weapon: 'axe', beard: '#b0662a', bare: 1 },
    desc: 'Hache à deux mains : frappe tous les ennemis devant lui d\'un coup.' },
  { k: 'berserk', name: 'Berserker', cat: 'army', r: 4.5, spd: 50, hp: 150, arm: 0, dmg: 15, reach: 2.5, cd: 0.7, vis: 200, beh: B.MELEE, flags: F.BERSERK | F.BRAVE | F.LIFESTEAL,
    look: { tunic: 1, skin: '#e8a988', helmet: 'wolf', weapon: 'axes', beard: '#c0442a', bare: 1 },
    desc: 'Plus il est blessé, plus il frappe vite et fort. Se soigne avec 30 % des dégâts infligés.' },
  { k: 'archer', name: 'Archer', cat: 'army', r: 4, spd: 40, hp: 60, arm: 0, dmg: 10, rng: 230, cd: 1.6, vis: 270, beh: B.RANGED, proj: P.ARROW, flags: F.KITE,
    look: { tunic: 1, helmet: 'hood', weapon: 'bow', quiver: 1 },
    desc: 'Tir en cloche avec anticipation du mouvement. Recule si un ennemi s\'approche trop.' },
  { k: 'xbow', name: 'Arbalétrier', cat: 'army', r: 4.5, spd: 34, hp: 85, arm: 1, dmg: 28, rng: 260, cd: 3.0, vis: 290, beh: B.RANGED, proj: P.BOLT, flags: F.AP,
    look: { tunic: 1, helmet: 'kettle', weapon: 'xbow' },
    desc: 'Carreau tendu perforant : ignore l\'armure. Lent à recharger.' },
  { k: 'javelin', name: 'Javelinier', cat: 'army', r: 4.5, spd: 44, hp: 90, arm: 1, dmg: 22, rng: 130, cd: 2.2, vis: 200, beh: B.RANGED, proj: P.JAVELIN, flags: F.KITE,
    look: { tunic: 1, helmet: 'cap', weapon: 'javelin', shield: 'small' },
    desc: 'Lance des javelots à courte portée, puissants contre les unités lourdes.' },
  { k: 'musket', name: 'Mousquetaire', cat: 'army', r: 4.5, spd: 36, hp: 85, arm: 0, dmg: 36, rng: 290, cd: 3.6, vis: 320, beh: B.RANGED, proj: P.BULLET, flags: 0,
    look: { tunic: 1, helmet: 'tricorn', weapon: 'musket', pants: '#e8e2d0' },
    desc: 'Tir instantané dévastateur mais imprécis, nuage de fumée. Rechargement très long.' },
  { k: 'sniper', name: 'Tireur d\'élite', cat: 'army', r: 4, spd: 32, hp: 60, arm: 0, dmg: 95, rng: 640, cd: 4.5, vis: 660, beh: B.RANGED, proj: P.BULLET, flags: F.KITE | F.PICKY | F.AP,
    look: { tunic: 0.6, helmet: 'ghillie', weapon: 'rifle' },
    desc: 'Portée énorme. Vise en priorité les rois, mages, soigneurs et tireurs.' },
  { k: 'grenadier', name: 'Grenadier', cat: 'army', r: 4.5, spd: 38, hp: 95, arm: 1, dmg: 50, aoe: 34, rng: 170, minr: 30, cd: 3.2, vis: 220, beh: B.RANGED, proj: P.GRENADE, flags: 0,
    look: { tunic: 1, helmet: 'bearskin', weapon: 'grenade' },
    desc: 'Lance des grenades à mèche (dégâts de zone, recul). Ne tire pas à bout portant.' },
  { k: 'flamer', name: 'Lance-flammes', cat: 'army', r: 4.5, spd: 36, hp: 130, arm: 2, dmg: 3.2, rng: 62, cd: 0.05, vis: 200, beh: B.RANGED, proj: P.FLAME, flags: F.EXPLODE | F.FIREPROOF,
    look: { tunic: 1, armor: '#5d6248', helmet: 'gasmask', weapon: 'flamer' },
    desc: 'Jet de flammes : met le feu aux troupes et au terrain. Son réservoir explose à sa mort.' },
  { k: 'mage', name: 'Mage', cat: 'army', r: 4, spd: 36, hp: 75, arm: 0, dmg: 42, aoe: 30, rng: 250, cd: 2.8, vis: 280, beh: B.RANGED, proj: P.FIREBALL, flags: F.KITE | F.FIREPROOF,
    look: { tunic: 1, robe: 1, helmet: 'wizard', weapon: 'staff', beard: '#ddd' },
    desc: 'Boules de feu explosives et incendiaires. Garde ses distances.' },
  { k: 'monk', name: 'Moine soigneur', cat: 'army', r: 4, spd: 40, hp: 75, arm: 0, dmg: 0, heal: 16, rng: 70, cd: 0.25, vis: 220, beh: B.HEAL, flags: F.COWARD,
    look: { tunic: 1, robe: 1, helmet: 'monk', weapon: 'book' },
    desc: 'Cherche le blessé allié le plus proche et le soigne. Évite le contact avec l\'ennemi.' },
  { k: 'drummer', name: 'Tambour', cat: 'army', r: 4, spd: 40, hp: 70, arm: 0, dmg: 5, reach: 2, cd: 1, vis: 200, beh: B.SUPPORT, flags: F.AURA,
    look: { tunic: 1, helmet: 'shako', weapon: 'drum' },
    desc: 'Aura (rayon 100) : alliés +20 % vitesse, +30 % dégâts, ne fuient plus. Reste en retrait.' },
  { k: 'ninja', name: 'Ninja', cat: 'army', r: 4, spd: 72, hp: 75, arm: 0, dmg: 20, reach: 2.5, cd: 0.5, vis: 420, beh: B.NINJA, proj: P.SHURIKEN, rng: 110, flags: F.DODGE | F.PICKY | F.BRAVE,
    look: { tunic: 0.25, helmet: 'ninja', weapon: 'katana' },
    desc: 'Se téléporte derrière les tireurs et soigneurs ennemis. Esquive 50 % des projectiles, lance des shurikens.' },
  { k: 'sapper', name: 'Sapeur', cat: 'army', r: 4.5, spd: 56, hp: 60, arm: 0, dmg: 160, aoe: 55, cd: 1, vis: 700, beh: B.SAPPER, flags: F.EXPLODE | F.PREFBUILD | F.BRAVE,
    look: { tunic: 1, helmet: 'cap', weapon: 'bomb' },
    desc: 'Fonce vers les bâtiments ennemis (sinon la foule) et se fait exploser. Dégâts ×3 sur bâtiments et murs.' },
  { k: 'cavalry', name: 'Cavalier', cat: 'army', r: 6.5, spd: 82, hp: 230, arm: 2, dmg: 26, reach: 3, cd: 1.0, vis: 300, beh: B.CAV, mass: 3, flags: F.MOUNTED,
    look: { tunic: 1, armor: '#aab2ba', helmet: 'kettle', weapon: 'lance', mount: '#7a4f2c' },
    desc: 'Charge : accélère, percute (dégâts ×2,5 + recul), traverse les lignes puis fait demi-tour pour recharger.' },
  { k: 'harcher', name: 'Archer monté', cat: 'army', r: 6.5, spd: 78, hp: 140, arm: 1, dmg: 8, rng: 200, cd: 1.3, vis: 260, beh: B.RANGED, proj: P.ARROW, mass: 3, flags: F.MOUNTED | F.KITE | F.MOVESHOOT,
    look: { tunic: 1, helmet: 'fur', weapon: 'bow', mount: '#c9a26b' },
    desc: 'Harcèle : tire en se déplaçant et reste hors de portée de l\'infanterie.' },
  { k: 'king', name: 'Roi', cat: 'army', r: 6, spd: 30, hp: 1500, arm: 6, dmg: 45, reach: 5, cd: 1.0, vis: 220, beh: B.MELEE, mass: 4, flags: F.CLEAVE | F.BRAVE | F.KING | F.AURA,
    look: { tunic: 1, armor: '#d9b44a', helmet: 'crown', weapon: 'bigsword', cape: 1, beard: '#6a4a2a', scale: 1.3 },
    desc: 'Énorme et galvanisant (aura). S\'il meurt, toute son armée panique et fuit quelques secondes.' },
  // ------------------------------------------------------------- SIÈGE
  { k: 'catapult', name: 'Catapulte', cat: 'siege', r: 9, spd: 14, hp: 420, arm: 2, dmg: 90, aoe: 46, rng: 760, minr: 120, cd: 6.0, vis: 780, beh: B.RANGED, proj: P.STONE, mass: 10, flags: F.SIEGE | F.PREFBUILD | F.BRAVE,
    desc: 'Pierres en cloche à très longue portée (zone). Vise les bâtiments en priorité. Inutile de près.' },
  { k: 'ballista', name: 'Baliste', cat: 'siege', r: 8, spd: 16, hp: 320, arm: 2, dmg: 75, rng: 520, cd: 4.5, vis: 540, beh: B.RANGED, proj: P.BBOLT, mass: 9, flags: F.SIEGE | F.AP | F.BRAVE,
    desc: 'Énorme carreau qui transperce jusqu\'à 8 ennemis alignés.' },
  { k: 'cannon', name: 'Canon', cat: 'siege', r: 8, spd: 13, hp: 360, arm: 3, dmg: 100, rng: 600, minr: 40, cd: 5.5, vis: 620, beh: B.RANGED, proj: P.CANNON, mass: 10, flags: F.SIEGE | F.BRAVE,
    desc: 'Boulet qui ricoche et fauche des rangs entiers, puis explose.' },
  { k: 'ram', name: 'Bélier', cat: 'siege', r: 9, spd: 22, hp: 700, arm: 9, dmg: 260, reach: 3, cd: 2.2, vis: 3000, beh: B.RAM, mass: 14, flags: F.SIEGE | F.ONLYBUILD | F.BRAVE,
    desc: 'Ignore les soldats et défonce bâtiments et murs. Très blindé.' },
  // ------------------------------------------------------------- BÂTIMENTS
  { k: 'hut', name: 'Hutte', cat: 'build', r: 13, hp: 380, arm: 0, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC | F.FLAMMABLE, spawn: 'peasant', every: 6,
    desc: 'Produit des paysans toutes les 6 s. Toit de paille très inflammable.' },
  { k: 'barracks', name: 'Caserne', cat: 'build', r: 20, hp: 1000, arm: 2, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC | F.FLAMMABLE, spawn: ['soldier', 'spear', 'soldier', 'shield'], every: 5,
    desc: 'Produit fantassins, lanciers et boucliers toutes les 5 s.' },
  { k: 'range', name: 'Camp d\'archers', cat: 'build', r: 17, hp: 650, arm: 0, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC | F.FLAMMABLE, spawn: ['archer', 'archer', 'xbow'], every: 5.5,
    desc: 'Produit archers et arbalétriers.' },
  { k: 'stable', name: 'Écurie', cat: 'build', r: 20, hp: 850, arm: 1, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC | F.FLAMMABLE, spawn: ['cavalry', 'harcher'], every: 9,
    desc: 'Produit cavaliers et archers montés toutes les 9 s.' },
  { k: 'workshop', name: 'Atelier de siège', cat: 'build', r: 20, hp: 900, arm: 1, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC | F.FLAMMABLE, spawn: ['catapult', 'ram', 'ballista', 'cannon'], every: 16,
    desc: 'Construit catapultes, béliers, balistes et canons.' },
  { k: 'tower', name: 'Tour d\'archers', cat: 'build', r: 10, hp: 1100, arm: 5, dmg: 12, rng: 330, cd: 0.7, vis: 340, beh: B.BUILD, proj: P.ARROW, flags: F.BUILD | F.STATIC,
    desc: 'Tour de pierre qui arrose les ennemis de flèches (portée 330).' },
  { k: 'magetower', name: 'Tour de mage', cat: 'build', r: 10, hp: 850, arm: 3, dmg: 50, aoe: 34, rng: 320, cd: 2.6, vis: 330, beh: B.BUILD, proj: P.FIREBALL, flags: F.BUILD | F.STATIC,
    desc: 'Lance des boules de feu sur les groupes ennemis.' },
  { k: 'bastion', name: 'Bastion à canon', cat: 'build', r: 13, hp: 1400, arm: 6, dmg: 110, rng: 560, cd: 5, vis: 570, beh: B.BUILD, proj: P.CANNON, flags: F.BUILD | F.STATIC,
    desc: 'Fortin équipé d\'un canon longue portée.' },
  { k: 'temple', name: 'Temple', cat: 'build', r: 17, hp: 800, arm: 2, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC | F.HEALAURA, spawn: 'monk', every: 14,
    desc: 'Soigne en permanence les alliés proches (rayon 120) et forme des moines.' },
  { k: 'castle', name: 'Château', cat: 'build', r: 40, hp: 14000, arm: 8, dmg: 14, rng: 380, cd: 0.35, vis: 390, beh: B.BUILD, proj: P.ARROW, flags: F.BUILD | F.STATIC, spawn: ['knight', 'soldier', 'archer', 'knight', 'spear'], every: 4,
    desc: 'Forteresse : tirs de flèches en rafale, produit chevaliers et soldats. Immense résistance.' },
  { k: 'tent', name: 'Tente de commandement', cat: 'build', r: 12, hp: 400, arm: 0, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC | F.FLAMMABLE | F.AURA, spawn: ['drummer', 'ninja', 'sapper'], every: 10,
    desc: 'Aura galvanisante. Forme tambours, ninjas et sapeurs.' },
  { k: 'barrel', name: 'Baril de poudre', cat: 'build', r: 4, hp: 25, arm: 0, vis: 0, beh: B.PROP, flags: F.BUILD | F.STATIC | F.EXPLODE | F.NEUTRAL, dmg: 140, aoe: 60,
    desc: 'Neutre. Explose au moindre choc ou au contact du feu : réactions en chaîne garanties.' },
];
G.UNITS = UNITS;
G.U = {};
UNITS.forEach((u, i) => {
  u.id = i;
  G.U[u.k] = i;
  u.mass = u.mass || (u.flags & F.BUILD ? 1000 : 1);
  u.reach = u.reach || 0;
  u.rng = u.rng || 0;
  u.minr = u.minr || 0;
  u.aoe = u.aoe || 0;
  u.dmg = u.dmg || 0;
  u.cd = u.cd || 1;
  u.spd = u.spd || 0;
  u.proj = u.proj || 0;
  u.heal = u.heal || 0;
});
UNITS.forEach((u) => {
  if (u.spawn) u.spawnIds = (Array.isArray(u.spawn) ? u.spawn : [u.spawn]).map((k) => G.U[k]);
});

// hot-loop tables
const N = UNITS.length;
G.UR = new Float32Array(N); G.USPD = new Float32Array(N); G.UHP = new Float32Array(N);
G.UARM = new Float32Array(N); G.UDMG = new Float32Array(N); G.UREACH = new Float32Array(N);
G.URNG = new Float32Array(N); G.UMINR = new Float32Array(N); G.UCD = new Float32Array(N);
G.UVIS = new Float32Array(N); G.UBEH = new Uint8Array(N); G.UPROJ = new Uint8Array(N);
G.UAOE = new Float32Array(N); G.UFL = new Int32Array(N); G.UMASS = new Float32Array(N);
G.UHEAL = new Float32Array(N); G.UVALUE = new Float32Array(N);
UNITS.forEach((u, i) => {
  G.UR[i] = u.r; G.USPD[i] = u.spd; G.UHP[i] = u.hp; G.UARM[i] = u.arm; G.UDMG[i] = u.dmg;
  G.UREACH[i] = u.reach; G.URNG[i] = u.rng; G.UMINR[i] = u.minr; G.UCD[i] = u.cd; G.UVIS[i] = u.vis;
  G.UBEH[i] = u.beh; G.UPROJ[i] = u.proj; G.UAOE[i] = u.aoe; G.UFL[i] = u.flags; G.UMASS[i] = u.mass;
  G.UHEAL[i] = u.heal;
  // "value" used by picky units (snipers / ninjas)
  let v = 1;
  if (u.flags & F.KING) v = 6;
  else if (u.beh === B.HEAL || u.k === 'mage' || u.k === 'drummer') v = 4;
  else if (u.beh === B.RANGED) v = 3;
  else if (u.flags & F.SIEGE) v = 2.5;
  G.UVALUE[i] = v;
});
