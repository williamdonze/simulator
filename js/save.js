'use strict';
// ============================================================================
//  Save / load the whole world: terrain, trees, every animal with its genome,
//  climate, events in progress, history, statistics and the RNG state.
//  Typed arrays are stored as base64. Slot in localStorage, or a .json file.
// ============================================================================
(function () {
  const VERSION = 1;
  const TYPES = { Float32Array, Uint8Array, Int32Array, Uint16Array, Int8Array, Uint32Array };
  function b64(ta) {
    const u8 = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength);
    let s = '';
    for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
    return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'));
  }
  function unb64(str, Type) {
    const s = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
    const u8 = new Uint8Array(s.length);
    for (let k = 0; k < s.length; k++) u8[k] = s.charCodeAt(k);
    return new Type(u8.buffer);
  }
  // deep encode: typed arrays → {$t, d}
  function enc(v) {
    if (ArrayBuffer.isView(v)) return { $t: v.constructor.name, d: b64(v) };
    if (Array.isArray(v)) return v.map(enc);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = enc(v[k]); return o; }
    return v;
  }
  function dec(v) {
    if (v && typeof v === 'object' && v.$t) return unb64(v.d, TYPES[v.$t]);
    if (Array.isArray(v)) return v.map(dec);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = dec(v[k]); return o; }
    return v;
  }
  // plain world state (everything that is not a per-animal or per-cell array)
  const KEYS = ['time', 'tick', 'weather', 'weatherT', 'weatherStart', 'rain', 'snow', 'wind', 'flags', 'maxAnimals', 'lastDay', 'hist', 'histT',
    'history', 'geneHist', 'seen', 'genRec', 'tally', 'world', 'cataRate', 'immigration', 'lastCata', 'counts',
    'climate', 'director', 'spMod', 'zones', 'notables', 'spHist', 'mana', 'godMode', 'regionStats'];
  G.save = {
    serialize() {
      const S = G.S;
      const o = { v: VERSION, W: S.W, H: S.H, rng: G.rngState(), animals: S.exportAnimals(), cells: {}, state: {} };
      const wa = S.WORLD_ARRAYS();
      for (const k in wa) o.cells[k] = wa[k];
      for (const k of KEYS) if (S[k] !== undefined) o.state[k] = S[k];
      return JSON.stringify(enc(o));
    },
    deserialize(json) {
      const o = dec(JSON.parse(json));
      if (!o || o.v !== VERSION) throw new Error('Sauvegarde incompatible');
      const S = G.S;
      if (o.W !== S.W || o.H !== S.H) { G.initWorld(o.W, o.H); if (G.R && G.R.initWorld) G.R.initWorld(); }
      else S.clearAll();
      const wa = S.WORLD_ARRAYS();
      for (const k in o.cells) if (wa[k]) wa[k].set(o.cells[k]);
      wa.fireT.fill(0);
      S.importAnimals(o.animals);
      for (const k in o.state) S[k] = o.state[k];
      S.cata = null;
      G.setSeed(o.rng);
      if (G.regions) G.regions.rebuild();
      G.bus.emit('loaded', {});
      return true;
    },
    toSlot(name = 'petitmonde.save') { const s = G.save.serialize(); localStorage.setItem(name, s); return s.length; },
    fromSlot(name = 'petitmonde.save') { const s = localStorage.getItem(name); if (!s) return false; return G.save.deserialize(s); },
    hasSlot(name = 'petitmonde.save') { try { return !!localStorage.getItem(name); } catch (e) { return false; } },
  };
})();
