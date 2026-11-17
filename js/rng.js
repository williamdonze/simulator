'use strict';
// ============================================================================
//  Central pseudo-random generator (mulberry32) for the whole simulation.
//  Everything that shapes the world's history draws from G.rand(): world
//  generation, decisions, mutations, weather, events. Same seed + same inputs
//  + same time scale ⇒ same history.
//  Remaining non-determinism (documented in README): visual particles,
//  the player's own brush strokes, and real-time frame pacing at ×1–×64
//  (the number of steps per frame depends on the machine).
// ============================================================================
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  G.mulberry32 = mulberry32;
  // the simulation stream: its whole state is one 32-bit integer (saved with the world)
  let a = (Date.now() ^ 0x5bd1e995) | 0;
  G.rand = function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  G.setSeed = function (s) { a = s | 0; };
  G.rngState = () => a;
  G.randInt = (n) => (G.rand() * n) | 0;
  G.randPick = (arr) => arr[(G.rand() * arr.length) | 0];
})();
