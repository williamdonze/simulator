'use strict';
// ============================================================================
//  Event bus: systems publish facts ("extinction", "catastrophe", "power",
//  "migration", "birth-boom"…) and others react, without knowing each other.
//  Handlers run synchronously; emit() during an emit is queued (no recursion).
// ============================================================================
(function () {
  const subs = new Map();
  const queue = [];
  let busy = false;
  G.bus = {
    on(type, fn) { if (!subs.has(type)) subs.set(type, []); subs.get(type).push(fn); return () => G.bus.off(type, fn); },
    off(type, fn) { const l = subs.get(type); if (l) { const k = l.indexOf(fn); if (k >= 0) l.splice(k, 1); } },
    emit(type, data) {
      queue.push([type, data]);
      if (busy) return;
      busy = true;
      try {
        for (let n = 0; queue.length && n < 1000; n++) {
          const [t, d] = queue.shift();
          for (const fn of subs.get(t) || []) fn(d, t);
          for (const fn of subs.get('*') || []) fn(d, t);
        }
        queue.length = 0;
      } finally { busy = false; }
    },
    clear() { subs.clear(); queue.length = 0; },
  };
})();
