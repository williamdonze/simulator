'use strict';
// ============================================================================
//  Petit Monde — headless test suite (Node ≥ 16, no dependencies).
//    node tests/run.js            all tests
//    node tests/run.js quick      skip the long simulations
//  Loads the simulation scripts listed in index.html (not the renderer / UI).
// ============================================================================
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global; global.document = {};
const store = {};
global.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = /sprites|render|ui\.js|godui|main|icons/;
for (const m of html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)) if (!SKIP.test(m[1])) require(path.join(ROOT, m[1]));
const noop = () => {};
G.fx = new Proxy({}, { get: () => noop });
const S = G.S, U = G.U, T = G.T;
const quick = process.argv.includes('quick');

let pass = 0, fail = 0;
const results = [];
function test(name, fn) {
  const t0 = Date.now();
  try { const info = fn(); pass++; results.push(`  ok   ${name}${info ? ' — ' + info : ''} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) { fail++; results.push(`  FAIL ${name}: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`); }
  console.log(results[results.length - 1]);
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion'); };
const YEAR = G.SEASON_DAYS * 4;
function world(seed, opts = {}) { G.initWorld(1104, 640); return G.generate(Object.assign({ seed }, opts)); }
function runDays(days, tk = 4) { S.setTimeScale(tk); const n = Math.round(days * G.DAY / (G.DT * tk)); for (let k = 0; k < n; k++) S.step(); S.setTimeScale(1); }
function animals() { let n = 0; for (let t = 0; t < G.NSP; t++) if (!(G.UFL[t] & G.F.STATIC)) n += S.counts[t]; return n; }
function sane() {
  for (let i = 0; i < S.hw; i++) {
    if (!S.alive[i]) continue;
    for (const a of [S.x, S.y, S.en, S.wat, S.hp, S.age]) if (!Number.isFinite(a[i])) throw new Error(`NaN on animal ${i} (${G.UNITS[S.type[i]].k})`);
    if (S.x[i] < -5 || S.y[i] < -5 || S.x[i] > S.W + 5 || S.y[i] > S.H + 5) throw new Error(`animal ${i} out of the world`);
  }
  for (let t = 0; t < G.NSP; t++) if (S.counts[t] < 0) throw new Error('negative population');
  for (let c = 0; c < S.veg.length; c += 7) if (!Number.isFinite(S.veg[c])) throw new Error('NaN vegetation');
  let n = 0; for (let i = 0; i < S.hw; i++) n += S.alive[i]; if (n !== S.count) throw new Error(`count mismatch ${n} vs ${S.count}`);
}
const digest = () => { let h = 0; for (let i = 0; i < S.hw; i++) if (S.alive[i]) h = (h * 31 + ((S.x[i] * 10) | 0) + S.type[i] * 7) | 0; return h + ':' + animals(); };

// ------------------------------------------------------------------ tests
test('génération d\'un monde', () => {
  const info = world(1234);
  assert(animals() > 20, 'too few animals');
  assert(info.water >= 0 && info.forest >= 0, 'bad info');
  sane();
  return `${animals()} animaux, eau ${(info.water * 100).toFixed(0)} %, forêt ${(info.forest * 100).toFixed(0)} %`;
});
test('reproductibilité (même seed ⇒ même histoire)', () => {
  world(777); runDays(20); const a = digest();
  world(777); runDays(20); const b = digest();
  assert(a === b, `${a} ≠ ${b}`);
  world(778); runDays(20); const c = digest();
  assert(a !== c, 'different seeds gave the same world');
  return a;
});
test('mondes variés (eau)', () => {
  const dry = world(5, { water: 0.02 }).water, wet = world(5, { water: 0.95 }).water;
  assert(dry < wet, `dry ${dry} ≥ wet ${wet}`);
  return `sec ${(dry * 100).toFixed(1)} % / humide ${(wet * 100).toFixed(1)} %`;
});
test('reproduction et mortalité sur un an', () => {
  world(42);
  const b0 = S.tally.births.reduce((a, v) => a + v, 0);
  runDays(YEAR);
  sane();
  const births = S.tally.births.reduce((a, v) => a + v, 0) - b0;
  let deaths = 0; for (const k in S.tally.deaths) deaths += S.tally.deaths[k].reduce((a, v) => a + v, 0);
  assert(births > 0, 'no births in a year');
  assert(deaths > 0, 'no deaths in a year');
  return `${births} naissances, ${deaths} morts`;
});
test('sauvegarde / chargement', () => {
  world(99); runDays(10);
  const before = digest(), t = S.time, json = G.save.serialize();
  runDays(5);
  G.save.deserialize(json);
  assert(digest() === before, 'animals differ after load');
  assert(S.time === t, 'time differs');
  runDays(3); sane();
  return `${(json.length / 1024).toFixed(0)} Ko`;
});
if (G.director) require('./sim_tests.js')({ test, assert, world, runDays, animals, sane, quick, YEAR });

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
