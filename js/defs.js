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
  AIR: 1 << 26, VEHICLE: 1 << 27, AAONLY: 1 << 28, CANAIR: 1 << 29, MINE: 1 << 30,
});

// behaviours
const B = (G.B = { MELEE: 0, RANGED: 1, CAV: 2, HEAL: 3, SUPPORT: 4, NINJA: 5, SAPPER: 6, RAM: 7, BUILD: 8, PROP: 9, DRONEK: 10, DRONEB: 11, JET: 12 });
// projectiles
const P = (G.P = { NONE: 0, ARROW: 1, BOLT: 2, BULLET: 3, GRENADE: 4, FIREBALL: 5, FLAME: 6, STONE: 7, BBOLT: 8, CANNON: 9, SHURIKEN: 10, JAVELIN: 11,
  ROCKET: 12, MISSILE: 13, SHELL: 14, MRL: 15, BOMB: 16, TSHELL: 17 });

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
  { k: 'ROAD',     name: 'Route',          col: [196, 196, 192], spd: 1.4,  block: 0, fuel: 0,   spread: 0, tool: true, desc: 'Les troupes y marchent 40 % plus vite.' },
  { k: 'ROCK',     name: 'Rochers',        col: [214, 210, 202], spd: 0,    block: 1, fuel: 0,   spread: 0, tool: true, desc: 'Obstacle indestructible, bloque les tirs tendus.' },
  { k: 'WALL',     name: 'Mur de béton',   col: [206, 204, 200], spd: 0,    block: 1, fuel: 0,   spread: 0, hp: 1400, tool: true, desc: 'Bloque tout. Les troupes le contournent… ou le démolissent. Les explosions le détruisent.' },
  { k: 'PALI',     name: 'Sacs de sable',  col: [226, 214, 180],   spd: 0,    block: 1, fuel: 0,  spread: 0, hp: 500, tool: true, desc: 'Rempart de sacs de sable, moins solide que le béton.' },
  { k: 'SPIKES',   name: 'Barbelés',       col: [236, 232, 214],  spd: 0.35,  block: 0, fuel: 0,   spread: 0, tool: true, desc: 'Blessent toute unité qui les traverse.' },
  { k: 'BURNT',    name: 'Cendres',        col: [170, 160, 148],    spd: 1.0,  block: 0, fuel: 0,   spread: 0 },
  { k: 'RUBBLE',   name: 'Gravats',        col: [214, 206, 192], spd: 0.7,  block: 0, fuel: 0,   spread: 0 },
];
G.TERRAIN.forEach((t, i) => (T[t.k] = i));

// ---------------------------------------------------------------- units
// r: radius, spd: world units/s, hp, arm: flat armor, dmg, reach (melee range beyond contact),
// rng: shooting range, minr: min range, cd: seconds between attacks, vis: vision radius
const UNITS = [
  // ------------------------------------------------------------- INFANTERIE
  { k: 'rifle', name: 'Fusilier', cat: 'inf', r: 4.5, spd: 40, hp: 100, arm: 1, dmg: 12, rng: 220, cd: 0.6, vis: 260, beh: B.RANGED, proj: P.BULLET, flags: F.CANAIR,
    look: { helmet: 'combat', vest: 1, weapon: 'ar' }, desc: 'Fusil d\'assaut, polyvalent. Peut tirer sur les drones.' },
  { k: 'mg', name: 'Mitrailleur', cat: 'inf', r: 4.5, spd: 30, hp: 140, arm: 2, dmg: 6, rng: 250, cd: 0.1, vis: 280, beh: B.RANGED, proj: P.BULLET, flags: F.CANAIR,
    look: { helmet: 'combat', vest: 1, weapon: 'mg' }, desc: 'Rafales continues qui fauchent l\'infanterie. Lent.' },
  { k: 'sniper', name: 'Sniper', cat: 'inf', r: 4, spd: 32, hp: 70, arm: 0, dmg: 110, rng: 650, cd: 4, vis: 680, beh: B.RANGED, proj: P.BULLET, flags: F.KITE | F.PICKY | F.AP | F.CANAIR,
    look: { tunic: 0.75, helmet: 'ghillie', weapon: 'rifle' }, desc: 'Portée énorme. Vise d\'abord officiers, médecins, servants d\'armes lourdes.' },
  { k: 'rpg', name: 'Lance-roquettes', cat: 'inf', r: 4.5, spd: 36, hp: 100, arm: 1, dmg: 80, aoe: 20, rng: 270, cd: 4, vis: 300, beh: B.RANGED, proj: P.ROCKET, flags: F.CANAIR,
    look: { helmet: 'combat', vest: 1, weapon: 'rpg' }, desc: 'Roquette antichar : dégâts ×2,5 sur véhicules, bâtiments et hélicoptères.' },
  { k: 'grenadier', name: 'Grenadier', cat: 'inf', r: 4.5, spd: 38, hp: 100, arm: 1, dmg: 45, aoe: 30, rng: 170, minr: 30, cd: 3, vis: 220, beh: B.RANGED, proj: P.GRENADE, flags: 0,
    look: { helmet: 'combat', vest: 1, weapon: 'grenade' }, desc: 'Grenades à fragmentation (zone + recul).' },
  { k: 'flamer', name: 'Lance-flammes', cat: 'inf', r: 4.5, spd: 36, hp: 140, arm: 2, dmg: 3.2, rng: 62, cd: 0.05, vis: 200, beh: B.RANGED, proj: P.FLAME, flags: F.EXPLODE | F.FIREPROOF,
    look: { vest: 1, helmet: 'gasmask', weapon: 'flamer' }, desc: 'Incendie troupes et terrain. Son réservoir explose à sa mort.' },
  { k: 'medic', name: 'Médecin', cat: 'inf', r: 4.5, spd: 42, hp: 90, arm: 0, dmg: 0, heal: 18, rng: 70, cd: 0.25, vis: 240, beh: B.HEAL, flags: F.COWARD,
    look: { helmet: 'medic', weapon: 'medkit' }, desc: 'Soigne le blessé allié le plus proche, évite le contact.' },
  { k: 'officer', name: 'Officier', cat: 'inf', r: 4.5, spd: 40, hp: 110, arm: 1, dmg: 8, reach: 2, cd: 1, vis: 220, beh: B.SUPPORT, flags: F.AURA,
    look: { helmet: 'beret', weapon: 'pistol' }, desc: 'Aura (rayon 100) : alliés +20 % vitesse, +30 % dégâts, ne paniquent plus.' },
  { k: 'riot', name: 'Bouclier', cat: 'inf', r: 5, spd: 32, hp: 220, arm: 4, dmg: 9, reach: 2.5, cd: 1, vis: 180, beh: B.MELEE, flags: F.SHIELD | F.BRAVE,
    look: { helmet: 'riot', vest: 1, weapon: 'baton', shield: 'riot' }, desc: 'Bouclier balistique : bloque 85 % des tirs de face, protège ceux derrière lui.' },
  { k: 'commando', name: 'Commando', cat: 'inf', r: 4.5, spd: 70, hp: 110, arm: 1, dmg: 22, reach: 2.5, cd: 0.4, vis: 420, beh: B.NINJA, proj: P.BULLET, rng: 150, flags: F.DODGE | F.PICKY | F.BRAVE | F.CANAIR,
    look: { tunic: 0.35, helmet: 'balaclava', weapon: 'smg' }, desc: 'S\'infiltre derrière les lignes pour éliminer snipers, médecins et officiers. Esquive 50 % des tirs.' },
  { k: 'sapper', name: 'Sapeur C4', cat: 'inf', r: 4.5, spd: 56, hp: 70, arm: 0, dmg: 180, aoe: 50, cd: 1, vis: 700, beh: B.SAPPER, flags: F.EXPLODE | F.PREFBUILD | F.BRAVE,
    look: { helmet: 'combat', vest: 1, weapon: 'c4' }, desc: 'Court poser sa charge sur les bâtiments et blindés ennemis. Dégâts ×3 sur structures.' },
  // ------------------------------------------------------------- VÉHICULES
  { k: 'jeep', name: 'Jeep mitrailleuse', cat: 'veh', r: 8.5, spd: 95, hp: 320, arm: 5, dmg: 9, rng: 230, cd: 0.13, vis: 280, beh: B.RANGED, proj: P.BULLET, mass: 6, flags: F.VEHICLE | F.MOVESHOOT | F.KITE | F.CANAIR | F.BRAVE,
    desc: 'Rapide : harcèle en tirant en mouvement et reste hors de portée.' },
  { k: 'apc', name: 'Blindé de transport', cat: 'veh', r: 10.5, spd: 55, hp: 900, arm: 9, dmg: 20, rng: 280, cd: 0.35, vis: 320, beh: B.RANGED, proj: P.BULLET, mass: 12, flags: F.VEHICLE | F.CANAIR | F.BRAVE, cargo: ['rifle', 4],
    desc: 'Canon automatique. Quand il est détruit, 4 fusiliers en sortent.' },
  { k: 'tank', name: 'Char d\'assaut', cat: 'veh', r: 12.5, spd: 28, hp: 1800, arm: 14, dmg: 140, aoe: 26, rng: 400, cd: 4.2, vis: 420, beh: B.RANGED, proj: P.TSHELL, mass: 25, flags: F.VEHICLE | F.SIEGE | F.BRAVE,
    desc: 'Blindage énorme (−14 par coup) : les balles ricochent. Obus explosif longue portée.' },
  { k: 'artillery', name: 'Obusier', cat: 'veh', r: 11, spd: 24, hp: 400, arm: 3, dmg: 110, aoe: 46, rng: 950, minr: 160, cd: 5.5, vis: 980, beh: B.RANGED, proj: P.SHELL, mass: 12, flags: F.VEHICLE | F.SIEGE | F.PREFBUILD | F.BRAVE,
    desc: 'Tir indirect à très longue portée. Inutile au contact.' },
  { k: 'mlrs', name: 'Lance-roquettes multiple', cat: 'veh', r: 11, spd: 28, hp: 500, arm: 4, dmg: 45, aoe: 24, rng: 850, minr: 160, cd: 10, vis: 880, beh: B.RANGED, proj: P.MRL, mass: 12, flags: F.VEHICLE | F.SIEGE | F.BRAVE,
    desc: 'Salve de 8 roquettes qui sature une zone entière.' },
  { k: 'aa', name: 'Véhicule anti-aérien', cat: 'veh', r: 11, spd: 40, hp: 700, arm: 8, dmg: 16, rng: 480, cd: 0.12, vis: 500, beh: B.RANGED, proj: P.BULLET, mass: 12, flags: F.VEHICLE | F.AAONLY | F.BRAVE,
    desc: 'Double canon antiaérien : ne tire que sur drones, hélicoptères et avions.' },
  // ------------------------------------------------------------- AÉRIEN
  { k: 'fpv', name: 'Drone kamikaze', cat: 'air', r: 3, spd: 125, hp: 12, arm: 0, dmg: 160, aoe: 22, cd: 1, vis: 600, beh: B.DRONEK, alt: 16, flags: F.AIR | F.EXPLODE | F.PICKY | F.BRAVE,
    desc: 'Survole tout et fonce sur les blindés et bâtiments ennemis pour exploser (×2,5 sur véhicules).' },
  { k: 'bomber', name: 'Drone bombardier', cat: 'air', r: 4.5, spd: 70, hp: 40, arm: 0, dmg: 70, aoe: 26, cd: 3.5, vis: 450, beh: B.DRONEB, proj: P.BOMB, alt: 26, flags: F.AIR | F.BRAVE,
    desc: 'Survole l\'ennemi, largue une bombe puis s\'écarte pour revenir.' },
  { k: 'heli', name: 'Hélicoptère', cat: 'air', r: 11, spd: 72, hp: 900, arm: 5, dmg: 60, aoe: 18, rng: 300, cd: 1.4, vis: 340, beh: B.RANGED, proj: P.ROCKET, alt: 34, mass: 10, flags: F.AIR | F.MOVESHOOT | F.CANAIR | F.BRAVE,
    desc: 'Roquettes sur les blindés et bâtiments, mitrailleuse sur l\'infanterie.' },
  { k: 'jet', name: 'Avion d\'attaque', cat: 'air', r: 10, spd: 230, hp: 450, arm: 4, dmg: 110, aoe: 40, cd: 2.5, vis: 1400, beh: B.JET, proj: P.BOMB, alt: 46, mass: 10, flags: F.AIR | F.BRAVE,
    desc: 'Passes de bombardement à grande vitesse, puis demi-tour pour la passe suivante.' },
  // ------------------------------------------------------------- BÂTIMENTS
  { k: 'bunker', name: 'Bunker', cat: 'build', r: 13, hp: 3000, arm: 12, dmg: 9, rng: 280, cd: 0.13, vis: 290, beh: B.BUILD, proj: P.BULLET, flags: F.BUILD | F.STATIC | F.CANAIR,
    desc: 'Casemate en béton armée d\'une mitrailleuse.' },
  { k: 'turret', name: 'Tourelle automatique', cat: 'build', r: 7, hp: 800, arm: 8, dmg: 11, rng: 320, cd: 0.12, vis: 330, beh: B.BUILD, proj: P.BULLET, flags: F.BUILD | F.STATIC | F.CANAIR,
    desc: 'Tire automatiquement sur tout ce qui approche, au sol comme en l\'air.' },
  { k: 'sam', name: 'Batterie de missiles', cat: 'build', r: 11, hp: 900, arm: 6, dmg: 220, rng: 700, cd: 3, vis: 710, beh: B.BUILD, proj: P.MISSILE, flags: F.BUILD | F.STATIC | F.AAONLY,
    desc: 'Missiles sol-air à tête chercheuse : abat drones, hélicoptères et avions.' },
  { k: 'barracks', name: 'Caserne', cat: 'build', r: 20, hp: 1100, arm: 4, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC, spawn: ['rifle', 'rifle', 'mg', 'rpg', 'rifle', 'medic', 'grenadier'], every: 3.5,
    desc: 'Forme fusiliers, mitrailleurs, lance-roquettes, médecins et grenadiers.' },
  { k: 'factory', name: 'Usine de blindés', cat: 'build', r: 24, hp: 1800, arm: 8, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC, spawn: ['jeep', 'apc', 'tank', 'aa', 'artillery', 'mlrs'], every: 12,
    desc: 'Produit jeeps, blindés, chars, anti-aériens et artillerie.' },
  { k: 'helipad', name: 'Héliport', cat: 'build', r: 18, hp: 900, arm: 4, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC, spawn: ['heli', 'jet', 'bomber'], every: 12,
    desc: 'Fait décoller hélicoptères, avions et drones bombardiers.' },
  { k: 'dronebase', name: 'Base de drones', cat: 'build', r: 14, hp: 700, arm: 3, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC, spawn: ['fpv', 'fpv', 'fpv', 'bomber'], every: 3,
    desc: 'Lance un essaim continu de drones kamikazes et bombardiers.' },
  { k: 'hospital', name: 'Hôpital de campagne', cat: 'build', r: 17, hp: 800, arm: 2, vis: 0, beh: B.BUILD, flags: F.BUILD | F.STATIC | F.HEALAURA, spawn: 'medic', every: 12,
    desc: 'Soigne en continu les alliés proches (rayon 120) et forme des médecins.' },
  { k: 'hq', name: 'Quartier général', cat: 'build', r: 34, hp: 9000, arm: 10, dmg: 10, rng: 340, cd: 0.25, vis: 350, beh: B.BUILD, proj: P.BULLET, flags: F.BUILD | F.STATIC | F.AURA | F.CANAIR, spawn: ['commando', 'officer', 'sniper', 'sapper'], every: 8,
    desc: 'Centre de commandement : aura galvanisante, défenses, forme les unités d\'élite.' },
  { k: 'mine', name: 'Mine', cat: 'build', r: 3, hp: 30, arm: 0, dmg: 200, aoe: 26, vis: 0, beh: B.PROP, flags: F.BUILD | F.STATIC | F.EXPLODE | F.MINE,
    desc: 'Explose quand un ennemi au sol passe dessus. Invisible pour l\'ennemi.' },
  { k: 'fuel', name: 'Dépôt de carburant', cat: 'build', r: 8, hp: 60, arm: 0, dmg: 220, aoe: 90, vis: 0, beh: B.PROP, flags: F.BUILD | F.STATIC | F.EXPLODE | F.NEUTRAL,
    desc: 'Neutre. Explose en boule de feu au moindre impact.' },
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
G.UHEAL = new Float32Array(N); G.UVALUE = new Float32Array(N); G.UALT = new Float32Array(N);
UNITS.forEach((u, i) => {
  G.UR[i] = u.r; G.USPD[i] = u.spd; G.UHP[i] = u.hp; G.UARM[i] = u.arm; G.UDMG[i] = u.dmg;
  G.UREACH[i] = u.reach; G.URNG[i] = u.rng; G.UMINR[i] = u.minr; G.UCD[i] = u.cd; G.UVIS[i] = u.vis;
  G.UBEH[i] = u.beh; G.UPROJ[i] = u.proj; G.UAOE[i] = u.aoe; G.UFL[i] = u.flags; G.UMASS[i] = u.mass;
  G.UHEAL[i] = u.heal;
  // "value" used by picky units (snipers / ninjas)
  let v = 1;
  if (u.k === 'tank') v = 7;
  else if (u.flags & F.VEHICLE) v = 5;
  else if (u.flags & F.BUILD) v = 2;
  else if (u.beh === B.HEAL || u.k === 'officer') v = 4;
  else if (u.k === 'rpg' || u.k === 'sniper' || u.k === 'mg') v = 3.5;
  else if (u.flags & F.AIR) v = 2;
  else if (u.beh === B.RANGED) v = 2.5;
  G.UVALUE[i] = v;
  G.UALT[i] = u.alt || 0;
});
