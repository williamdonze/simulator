'use strict';
// ============================================================================
//  Simulation — data-oriented (struct of typed arrays), fixed 30 Hz step.
//  * uniform spatial grid rebuilt every tick by counting sort
//  * one BFS flow field per team (cheap global path-finding around walls)
//  * staggered re-targeting with ring search over the grid
//  * projectiles, explosions, fire propagation, morale, auras
// ============================================================================
(function () {
  const F = G.F, B = G.B, P = G.P, T = G.T;
  const { MAXU, MAXP, NT, NEUTRAL, GC, TC } = G;
  const UR = G.UR, USPD = G.USPD, UHP = G.UHP, UARM = G.UARM, UDMG = G.UDMG, UREACH = G.UREACH,
    URNG = G.URNG, UMINR = G.UMINR, UCD = G.UCD, UVIS = G.UVIS, UBEH = G.UBEH, UPROJ = G.UPROJ,
    UAOE = G.UAOE, UFL = G.UFL, UMASS = G.UMASS, UHEAL = G.UHEAL, UVALUE = G.UVALUE, UALT = G.UALT;
  const NTT = G.TERRAIN.length;
  const TSPD = new Float32Array(NTT), TBLK = new Uint8Array(NTT), TFUEL = new Float32Array(NTT), TSPREAD = new Float32Array(NTT), THP = new Float32Array(NTT), TWATER = new Uint8Array(NTT);
  G.TERRAIN.forEach((t, i) => { TSPD[i] = t.spd; TBLK[i] = t.block; TFUEL[i] = t.fuel; TSPREAD[i] = t.spread; THP[i] = t.hp || 0; TWATER[i] = t.water || 0; });
  G.TBLK = TBLK;

  const S = (G.S = {});
  const DT = G.DT;

  // --------------------------------------------------------------- units
  const x = new Float32Array(MAXU), y = new Float32Array(MAXU);
  const px = new Float32Array(MAXU), py = new Float32Array(MAXU);
  const kx = new Float32Array(MAXU), ky = new Float32Array(MAXU);   // knock-back velocity
  const dX = new Float32Array(MAXU), dY = new Float32Array(MAXU);   // stored heading
  const hp = new Float32Array(MAXU), cd = new Float32Array(MAXU), atk = new Float32Array(MAXU);
  const burn = new Float32Array(MAXU), stun = new Float32Array(MAXU), flash = new Float32Array(MAXU);
  const flee = new Float32Array(MAXU), aux = new Float32Array(MAXU), aux2 = new Float32Array(MAXU);
  const anim = new Float32Array(MAXU), stuck = new Float32Array(MAXU);
  const type = new Uint8Array(MAXU), team = new Uint8Array(MAXU), alive = new Uint8Array(MAXU), state = new Uint8Array(MAXU);
  const buffed = new Uint8Array(MAXU), dying = new Uint8Array(MAXU);
  const deadQ = [];
  let curAtk = -1; // type of the unit currently dealing damage (stats)
  const qsrc = new Int16Array(MAXP);
  function flushDeaths() {
    for (let k = 0; k < deadQ.length; k += 3) { const j = deadQ[k]; dying[j] = 0; if (alive[j] && hp[j] <= 0) kill(j, deadQ[k + 1], deadQ[k + 2]); }
    deadQ.length = 0;
  }
  const face = new Int8Array(MAXU);
  const tgt = new Int32Array(MAXU).fill(-1), tgt2 = new Int32Array(MAXU).fill(-1), wallC = new Int32Array(MAXU).fill(-1);
  const cellOf = new Int32Array(MAXU), cellItems = new Int32Array(MAXU);
  const freeStack = new Int32Array(MAXU);
  let freeTop = 0, hw = 0;
  const pendingFree = [];
  Object.assign(S, { x, y, px, py, hp, type, team, alive, face, atk, flash, burn, anim, state, flee, buffed, tgt, stun });

  // --------------------------------------------------------------- projectiles
  const qx = new Float32Array(MAXP), qy = new Float32Array(MAXP), qz = new Float32Array(MAXP);
  const qpx = new Float32Array(MAXP), qpy = new Float32Array(MAXP), qpz = new Float32Array(MAXP);
  const qvx = new Float32Array(MAXP), qvy = new Float32Array(MAXP);
  const qsx = new Float32Array(MAXP), qsy = new Float32Array(MAXP), qtx = new Float32Array(MAXP), qty = new Float32Array(MAXP);
  const qT = new Float32Array(MAXP), qt = new Float32Array(MAXP), qh = new Float32Array(MAXP);
  const qdmg = new Float32Array(MAXP), qaoe = new Float32Array(MAXP);
  const qkind = new Uint8Array(MAXP), qteam = new Uint8Array(MAXP), qalive = new Uint8Array(MAXP), qpierce = new Uint8Array(MAXP), qap = new Uint8Array(MAXP);
  const qlast = new Int32Array(MAXP), qlastC = new Int32Array(MAXP), qtg = new Int32Array(MAXP);
  const qz0 = new Float32Array(MAXP);
  const qfree = new Int32Array(MAXP);
  let qfreeTop = 0, qhw = 0;
  S.proj = { x: qx, y: qy, z: qz, px: qpx, py: qpy, pz: qpz, vx: qvx, vy: qvy, kind: qkind, alive: qalive, team: qteam, T: qT, t: qt, h: qh, sx: qsx, sy: qsy, tx: qtx, ty: qty };

  // --------------------------------------------------------------- world grids
  let W, H, TW, TH, GW, GH, NC;
  let terr, thp, fireT, tvar, fireList, fireN = 0;
  let cellStart, tcount, ttot, bgrid, fblock, aura, healm, ctTick, ctRes, ctVis;
  let fdx = [], fdy = [], fp2 = [], edist = [], fhas = new Uint8Array(4);
  let fdist, fqueue, PW, PH, NP, padOf, pblock, markP2, pborder, edTmp;
  const sxA = new Float32Array(MAXU), syA = new Float32Array(MAXU), srA = new Float32Array(MAXU), smA = new Float32Array(MAXU);
  const axA = new Float32Array(MAXU), ayA = new Float32Array(MAXU);
  const blist = [];

  G.initWorld = function (w, h) {
    W = S.W = G.W = w; H = S.H = G.H = h;
    TW = S.TW = G.TW = Math.ceil(w / TC); TH = S.TH = G.TH = Math.ceil(h / TC);
    GW = S.GW = G.GW = Math.ceil(w / GC); GH = S.GH = G.GH = Math.ceil(h / GC);
    NC = GW * GH;
    terr = S.terr = new Uint8Array(TW * TH);
    thp = S.thp = new Float32Array(TW * TH);
    fireT = S.fireT = new Float32Array(TW * TH);
    tvar = S.tvar = new Uint8Array(TW * TH);
    for (let i = 0; i < tvar.length; i++) tvar[i] = (Math.random() * 256) | 0;
    fireList = new Int32Array(TW * TH); fireN = 0;
    cellStart = new Int32Array(NC + 1);
    tcount = S.tcount = new Uint16Array(NC * NT);
    ttot = new Uint16Array(NC);
    ctTick = new Int32Array(NC * 8).fill(-99); ctRes = new Int32Array(NC * 8); ctVis = new Float32Array(NC * 8);
    bgrid = new Int32Array(NC).fill(-1);
    fblock = new Uint8Array(NC);
    aura = new Uint8Array(NC * 4); healm = new Uint8Array(NC * 4);
    PW = GW + 2; PH = GH + 2; NP = PW * PH;
    padOf = new Int32Array(NC);
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) padOf[cy * GW + cx] = (cy + 1) * PW + cx + 1;
    pblock = new Uint8Array(NP); markP2 = new Uint8Array(NP); edTmp = new Uint16Array(NP);
    pborder = new Uint8Array(NP).fill(1);
    for (let c = 0; c < NC; c++) pborder[padOf[c]] = 0;
    fdist = new Int32Array(NP); fqueue = new Int32Array(Math.max(NC + 1, NP * 2));
    for (let t = 0; t < 4; t++) { fdx[t] = new Float32Array(NC); fdy[t] = new Float32Array(NC); fp2[t] = new Uint8Array(NC); edist[t] = new Uint16Array(NC).fill(65535); }
    S.clearAll();
  };

  S.clearAll = function () {
    alive.fill(0); hw = 0; freeTop = 0; pendingFree.length = 0;
    qalive.fill(0); qhw = 0; qfreeTop = 0;
    terr.fill(0); thp.fill(0); fireT.fill(0); fireN = 0;
    blist.length = 0; bgrid.fill(-1);
    S.count = 0; S.tick = 0; S.time = 0;
    if (ctTick) ctTick.fill(-99);
    S.phase = 'deploy';
    S.winner = -2;
    S.kills = [0, 0, 0, 0, 0];
    S.stance = [0, 0, 0, 0, 0];
    S.teamCount = [0, 0, 0, 0, 0];
    S.teamBuild = [0, 0, 0, 0, 0];
    S.typeCount = new Int32Array(G.UNITS.length * 4);
    S.terrDirty = true; S.flowDirty = true; S.bdirty = true;
    S.explQ = [];
    S.spawnQ = [];
    S.events = [];
    S.nproj = 0;
    tgt.fill(-1); tgt2.fill(-1); wallC.fill(-1);
    S.buildGrid();
  };

  // --------------------------------------------------------------- helpers
  const tcell = (wx, wy) => ((wy / TC) | 0) * TW + ((wx / TC) | 0);
  function blockedAt(wx, wy) {
    if (wx < 1 || wy < 1 || wx >= W - 1 || wy >= H - 1) return 1;
    return TBLK[terr[((wy / TC) | 0) * TW + ((wx / TC) | 0)]];
  }
  S.blockedAt = blockedAt;
  S.tcell = tcell;
  const rnd = Math.random;
  function rcol(r, g, b, a) { return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0; }
  S.rcol = rcol;

  // --------------------------------------------------------------- spawn / kill
  S.spawn = function (t, tm, wx, wy) {
    if (S.count >= MAXU - 8) return -1;
    let i;
    if (freeTop > 0) i = freeStack[--freeTop]; else i = hw++;
    const fl = UFL[t];
    if (fl & F.NEUTRAL) tm = NEUTRAL;
    x[i] = px[i] = wx; y[i] = py[i] = wy;
    kx[i] = ky[i] = 0; dX[i] = dY[i] = 0;
    type[i] = t; team[i] = tm; alive[i] = 1; state[i] = 0; dying[i] = 0;
    hp[i] = UHP[t]; cd[i] = rnd() * UCD[t]; atk[i] = 0; burn[i] = 0; stun[i] = 0; flash[i] = 0; flee[i] = 0;
    aux[i] = 0; aux2[i] = 0; anim[i] = rnd() * 10; stuck[i] = 0; buffed[i] = 0;
    tgt[i] = -1; tgt2[i] = -1; wallC[i] = -1;
    face[i] = wx < W / 2 ? 1 : -1;
    if (fl & F.BUILD) {
      const u = G.UNITS[t];
      aux[i] = u.every ? u.every * (0.3 + rnd() * 0.7) : 0;
      blist.push(i); S.bdirty = true;
    }
    S.count++;
    S.hw = hw;
    if (S.phase === 'battle' && tm < 4) S.stat.deployed[t * 4 + tm]++;
    return i;
  };

  function freeSlot(i) { pendingFree.push(i); }

  function kill(j, srcTeam, atkT) {
    if (!alive[j]) return;
    alive[j] = 0; S.count--; dying[j] = 0;
    if (S.phase === 'battle' && team[j] < 4) {
      const st = S.stat;
      st.lost[type[j] * 4 + team[j]]++;
      if (atkT >= 0 && srcTeam >= 0 && srcTeam < 4 && srcTeam !== team[j]) st.kills[atkT * 4 + srcTeam]++;
    }
    freeSlot(j);
    const t = type[j], fl = UFL[t];
    if (srcTeam >= 0 && srcTeam < 4 && srcTeam !== team[j]) S.kills[srcTeam]++;
    const fx = G.fx;
    if (fl & F.BUILD) {
      S.bdirty = true;
      const r = UR[t];
      if (!(fl & F.NEUTRAL)) {
        fx.decal(G.FR.rubble, x[j], y[j], r * 2.4, r * 1.7, 0, 0xffffffff);
        fx.burst(x[j], y[j], r, Math.min(60, 10 + r * 1.5));
        S.events.push({ kind: 'build', team: team[j], name: G.UNITS[t].name });
      }
    } else {
      fx.corpse(j);
    }
    if (fl & F.EXPLODE) {
      let R = UAOE[t] || 26, D = UDMG[t] || 40, fire = 0, et = team[j];
      if (G.UNITS[t].k === 'flamer') { R = 30; D = 45; fire = 1; }
      if (fl & F.NEUTRAL) { fire = 1; et = 255; }
      const kk = G.UNITS[t].k;
      if (kk === 'sapper') { et = team[j]; fire = 4 | 8; }
      else if (kk === 'fpv' || kk === 'mine') { fire = 8 | 4; }
      S.explQ.push(x[j], y[j], R, D, et, fire | 2, t);
    }
    const cg = G.UNITS[t].cargo;
    if (cg && S.phase === 'battle') for (let k = 0; k < cg[1]; k++) S.spawnQ.push(G.U[cg[0]], team[j], x[j] + (rnd() - 0.5) * 12, y[j] + (rnd() - 0.5) * 12);
    if (fl & F.AIR && !(fl & F.EXPLODE)) G.fx.explosion(x[j], y[j], 10 + UR[t], 1);
    if (fl & F.KING) {
      const tm = team[j];
      for (let k = 0; k < hw; k++) if (alive[k] && team[k] === tm && !(UFL[type[k]] & F.BUILD)) flee[k] = 2.5 + rnd() * 3;
      S.events.push({ kind: 'king', team: tm });
    }
  }
  S.kill = kill;
  S.remove = function (j) { // eraser: no corpse, no explosion
    if (!alive[j]) return;
    alive[j] = 0; S.count--; freeSlot(j);
    if (UFL[type[j]] & F.BUILD) S.bdirty = true;
  };

  // damage → returns damage dealt
  function damage(j, amt, srcTeam, ap) {
    if (!alive[j]) return 0;
    const t = type[j];
    if (!ap) { const a = UARM[t]; amt = amt - a > amt * 0.2 ? amt - a : amt * 0.2; }
    hp[j] -= amt;
    flash[j] = 0.12;
    if (hp[j] <= 0 && !dying[j]) { dying[j] = 1; deadQ.push(j, srcTeam, curAtk); }
    return amt;
  }
  S.damage = damage;

  // --------------------------------------------------------------- grid
  S.buildGrid = function () {
    // release slots of units killed during the previous tick
    for (let k = 0; k < pendingFree.length; k++) freeStack[freeTop++] = pendingFree[k];
    pendingFree.length = 0;
    while (hw > 0 && !alive[hw - 1]) {
      // shrink high-water mark; remove freed slot from stack lazily
      hw--;
    }
    // rebuild free stack to only contain indices < hw
    let w = 0;
    for (let k = 0; k < freeTop; k++) { const v = freeStack[k]; if (v < hw && !alive[v]) freeStack[w++] = v; }
    freeTop = w;

    cellStart.fill(0); tcount.fill(0); ttot.fill(0);
    const tc = S.teamCount; tc[0] = tc[1] = tc[2] = tc[3] = tc[4] = 0;
    const tb = S.teamBuild; tb[0] = tb[1] = tb[2] = tb[3] = tb[4] = 0;
    for (let i = 0; i < hw; i++) {
      if (!alive[i]) continue;
      let cx = (x[i] / GC) | 0, cy = (y[i] / GC) | 0;
      if (cx < 0) cx = 0; else if (cx >= GW) cx = GW - 1;
      if (cy < 0) cy = 0; else if (cy >= GH) cy = GH - 1;
      const c = cy * GW + cx;
      cellOf[i] = c;
      cellStart[c + 1]++;
      if (UFL[type[i]] & F.MINE) continue;
      tcount[c * NT + team[i]]++;
      if (team[i] < 4) ttot[c]++;
      tc[team[i]]++;
      if (UFL[type[i]] & F.BUILD) tb[team[i]]++;
    }
    for (let c = 0; c < NC; c++) cellStart[c + 1] += cellStart[c];
    // fill using a cursor copy (reuse fqueue as temp)
    const cur = fqueue;
    for (let c = 0; c < NC; c++) cur[c] = cellStart[c];
    for (let i = 0; i < hw; i++) if (alive[i]) cellItems[cur[cellOf[i]]++] = i;
    S.hw = hw;
  };

  function rebuildBuildings() {
    let w = 0;
    for (let k = 0; k < blist.length; k++) { const b = blist[k]; if (alive[b] && UFL[type[b]] & F.BUILD) blist[w++] = b; }
    blist.length = w;
    bgrid.fill(-1);
    for (const b of blist) {
      if (UFL[type[b]] & F.MINE) continue;
      const r = UR[type[b]] + 4;
      const x0 = Math.max(0, ((x[b] - r) / GC) | 0), x1 = Math.min(GW - 1, ((x[b] + r) / GC) | 0);
      const y0 = Math.max(0, ((y[b] - r) / GC) | 0), y1 = Math.min(GH - 1, ((y[b] + r) / GC) | 0);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const ccx = Math.max(cx * GC, Math.min(x[b], cx * GC + GC)), ccy = Math.max(cy * GC, Math.min(y[b], cy * GC + GC));
        if ((ccx - x[b]) ** 2 + (ccy - y[b]) ** 2 <= r * r) bgrid[cy * GW + cx] = b;
      }
    }
    S.bdirty = false;
  }
  S.blist = blist;

  // --------------------------------------------------------------- flow fields
  function rebuildFlowBlock() {
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      let solid = 0, wall = 0;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const tx = cx * 2 + sx, ty = cy * 2 + sy;
        if (tx >= TW || ty >= TH) { solid++; continue; }
        const tt = terr[ty * TW + tx];
        if (tt === T.WALL || tt === T.PALI) wall++;
        else if (TBLK[tt]) solid++;
      }
      fblock[cy * GW + cx] = solid + wall >= 2 ? (wall > 0 ? 1 : 2) : 0;
    }
    pblock.fill(2);
    for (let c = 0; c < NC; c++) pblock[padOf[c]] = fblock[c];
  }
  const NDX = [1, -1, 0, 0, 1, 1, -1, -1], NDY = [0, 0, 1, -1, 1, -1, 1, -1];
  const INF = 0x3fffffff;

  function computeFlow(tm) {
    const dist = fdist, q = fqueue, pb = pblock;
    const O = [1, -1, PW, -PW, PW + 1, -PW + 1, PW - 1, -PW - 1];
    const o0 = 1, o1 = -1, o2 = PW, o3 = -PW, o4 = PW + 1, o5 = -PW + 1, o6 = PW - 1, o7 = -PW - 1;
    dist.fill(INF);
    let qh = 0, qt = 0;
    for (let c = 0; c < NC; c++) {
      if (fblock[c] === 2) continue;
      const b = c * NT;
      let e = 0;
      for (let k = 0; k < 4; k++) if (k !== tm) e += tcount[b + k];
      if (e > 0) { const pc = padOf[c]; dist[pc] = 0; q[qt++] = pc; }
    }
    fhas[tm] = qt > 0 ? 1 : 0;
    const nsrc = qt;
    // ---- obstacle-free chebyshev distance (skip target searches far from enemies)
    {
      const ed = edist[tm], dd = edTmp, tmp = q.subarray(NP);
      dd.fill(65535);
      for (let k = 0; k < NP; k++) if (pborder[k]) dd[k] = 65534;
      let h2 = 0, t2 = 0;
      for (let k = 0; k < nsrc; k++) { dd[q[k]] = 0; tmp[t2++] = q[k]; }
      while (h2 < t2) {
        const c = tmp[h2++], d = dd[c] + 1;
        for (let k = 0; k < 8; k++) {
          const n = c + O[k];
          if (dd[n] !== 65535) continue;
          dd[n] = d; tmp[t2++] = n;
        }
      }
      for (let c = 0; c < NC; c++) ed[c] = dd[padOf[c]];
    }
    const p2 = fp2[tm];
    p2.fill(0);
    // ---- pass 1: walls block
    while (qh < qt) {
      const c = q[qh++], d = dist[c] + 1;
      let n;
      n = c + o0; if (pb[n] === 0 && dist[n] === INF) { dist[n] = d; q[qt++] = n; }
      n = c + o1; if (pb[n] === 0 && dist[n] === INF) { dist[n] = d; q[qt++] = n; }
      n = c + o2; if (pb[n] === 0 && dist[n] === INF) { dist[n] = d; q[qt++] = n; }
      n = c + o3; if (pb[n] === 0 && dist[n] === INF) { dist[n] = d; q[qt++] = n; }
      n = c + o4; if (pb[n] === 0 && dist[n] === INF && pb[c + o0] === 0 && pb[c + o2] === 0) { dist[n] = d; q[qt++] = n; }
      n = c + o5; if (pb[n] === 0 && dist[n] === INF && pb[c + o0] === 0 && pb[c + o3] === 0) { dist[n] = d; q[qt++] = n; }
      n = c + o6; if (pb[n] === 0 && dist[n] === INF && pb[c + o1] === 0 && pb[c + o2] === 0) { dist[n] = d; q[qt++] = n; }
      n = c + o7; if (pb[n] === 0 && dist[n] === INF && pb[c + o1] === 0 && pb[c + o3] === 0) { dist[n] = d; q[qt++] = n; }
    }
    // ---- pass 2: walls passable (units will break through)
    qh = 0;
    while (qh < qt) {
      const c = q[qh++], d = dist[c] + 3;
      for (let k = 0; k < 4; k++) {
        const n = c + O[k];
        if (pb[n] === 2 || dist[n] !== INF) continue;
        dist[n] = d; q[qt++] = n;
        markP2[n] = 1;
      }
    }
    // ---- directions (unpadded outputs)
    const ox = fdx[tm], oy = fdy[tm];
    for (let c = 0; c < NC; c++) {
      const pc = padOf[c];
      p2[c] = markP2[pc]; markP2[pc] = 0;
      const dc = dist[pc];
      if (dc === INF || dc === 0) { ox[c] = 0; oy[c] = 0; continue; }
      let best = dc, bk = -1, dn;
      dn = dist[pc + o0]; if (dn < best) { best = dn; bk = 0; }
      dn = dist[pc + o1]; if (dn < best) { best = dn; bk = 1; }
      dn = dist[pc + o2]; if (dn < best) { best = dn; bk = 2; }
      dn = dist[pc + o3]; if (dn < best) { best = dn; bk = 3; }
      if (pb[pc + o0] === 0 && pb[pc + o2] === 0) { dn = dist[pc + o4] + 0.41; if (dn < best) { best = dn; bk = 4; } }
      if (pb[pc + o0] === 0 && pb[pc + o3] === 0) { dn = dist[pc + o5] + 0.41; if (dn < best) { best = dn; bk = 5; } }
      if (pb[pc + o1] === 0 && pb[pc + o2] === 0) { dn = dist[pc + o6] + 0.41; if (dn < best) { best = dn; bk = 6; } }
      if (pb[pc + o1] === 0 && pb[pc + o3] === 0) { dn = dist[pc + o7] + 0.41; if (dn < best) { best = dn; bk = 7; } }
      if (bk < 0) { ox[c] = 0; oy[c] = 0; }
      else if (bk < 4) { ox[c] = NDX[bk]; oy[c] = NDY[bk]; }
      else { ox[c] = NDX[bk] * 0.7071; oy[c] = NDY[bk] * 0.7071; }
    }
  }
  S.flowDir = function (tm, wx, wy) {
    const c = Math.max(0, Math.min(NC - 1, ((wy / GC) | 0) * GW + ((wx / GC) | 0)));
    return tm < 4 ? [fdx[tm][c], fdy[tm][c]] : [0, 0];
  };

  // --------------------------------------------------------------- targeting
  // mode 0: enemy, 1: injured ally, 2: enemy building
  function findTarget(i, vis, mode) {
    const tm = team[i], t = type[i], fl = UFL[t];
    const xi = x[i], yi = y[i];
    let cx = (xi / GC) | 0, cy = (yi / GC) | 0;
    const R = Math.min(Math.ceil(vis / GC), 64);
    const picky = (fl & F.PICKY) && mode === 0;
    const canAir = (fl & (F.CANAIR | F.AAONLY)) ? 1 : 0, aaOnly = fl & F.AAONLY;
    let best = -1, bestS = 1e9, found = -1;
    const extra = picky ? 6 : 1;
    let r0 = 0;
    if (mode !== 1 && tm < 4) {
      if (cx < 0) cx = 0; else if (cx >= GW) cx = GW - 1;
      if (cy < 0) cy = 0; else if (cy >= GH) cy = GH - 1;
      const ed = edist[tm][cy * GW + cx];
      if (ed > R + 3) return -1;
      r0 = ed > 3 ? ed - 3 : 0;
    }
    // per-cell/per-team cache for plain nearest-enemy searches
    let ck = -1;
    if (mode === 0 && !picky && tm < 4) {
      ck = ((cy * GW + cx) * 4 + tm) * 2 + canAir;
      if (aaOnly) ck = -1;
    }
    if (ck >= 0) {
      if (S.tick - ctTick[ck] < 3 && ctVis[ck] >= vis) {
        const j = ctRes[ck];
        if (j < 0) return -1;
        if (alive[j] && team[j] !== tm) {
          const dx = x[j] - xi, dy = y[j] - yi;
          if (Math.sqrt(dx * dx + dy * dy) - UR[type[j]] <= vis) return j;
        }
      }
    }
    for (let r = r0; r <= R; r++) {
      if (found >= 0 && r > found + extra) break;
      const y0 = cy - r, y1 = cy + r, x0 = cx - r, x1 = cx + r;
      for (let yy = y0; yy <= y1; yy++) {
        if (yy < 0 || yy >= GH) continue;
        const edge = yy === y0 || yy === y1;
        const step = edge || r === 0 ? 1 : x1 - x0;
        for (let xx = x0; xx <= x1; xx += step) {
          if (xx < 0 || xx >= GW) continue;
          const c = yy * GW + xx, b = c * NT;
          if (mode === 1) { if (tcount[b + tm] === 0) continue; }
          else if (ttot[c] === tcount[b + tm]) continue;
          const s0 = cellStart[c], s1 = cellStart[c + 1];
          for (let k = s0; k < s1; k++) {
            const j = cellItems[k];
            if (!alive[j]) continue;
            const tj = type[j], tf = UFL[tj];
            if (tf & F.MINE) continue;
            if (tf & F.AIR) { if (!canAir) continue; } else if (aaOnly) continue;
            if (mode === 1) {
              if (team[j] !== tm || j === i || (tf & F.BUILD) || hp[j] >= UHP[tj] * 0.97) continue;
            } else {
              const tt = team[j];
              if (tt === tm || tt === NEUTRAL) continue;
              if (mode === 2 && !(tf & F.BUILD)) continue;
            }
            const dx = x[j] - xi, dy = y[j] - yi;
            let d = Math.sqrt(dx * dx + dy * dy) - UR[tj];
            if (d > vis) continue;
            let s = d;
            if (picky) s = d / UVALUE[tj];
            else if (mode === 1) s = d * (0.3 + hp[j] / UHP[tj]);
            if (s < bestS) { bestS = s; best = j; if (found < 0) found = r; }
          }
        }
      }
    }
    if (ck >= 0) { ctTick[ck] = S.tick; ctRes[ck] = best; ctVis[ck] = vis; }
    return best;
  }
  S.findTarget = findTarget;

  function nearestEnemyBuilding(i, maxd) {
    const tm = team[i];
    let best = -1, bd = maxd;
    for (let k = 0; k < blist.length; k++) {
      const b = blist[k];
      if (!alive[b] || team[b] === tm || team[b] === NEUTRAL || (UFL[type[b]] & F.MINE)) continue;
      const d = Math.hypot(x[b] - x[i], y[b] - y[i]) - UR[type[b]];
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function damagedFriendlyBuilding(i, maxd) {
    const tm = team[i];
    let best = -1, bd = maxd;
    for (let k = 0; k < blist.length; k++) {
      const b = blist[k];
      if (!alive[b] || team[b] !== tm || hp[b] >= UHP[type[b]]) continue;
      const d = Math.hypot(x[b] - x[i], y[b] - y[i]) - UR[type[b]];
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // unit hit test at a point: nearest unit not of `tm` (neutral props included)
  function hitAt(hx, hy, rad, tm, skip, am = 0) {
    let cx = (hx / GC) | 0, cy = (hy / GC) | 0;
    let best = -1, bd = 1e9;
    for (let yy = cy - 1; yy <= cy + 1; yy++) {
      if (yy < 0 || yy >= GH) continue;
      for (let xx = cx - 1; xx <= cx + 1; xx++) {
        if (xx < 0 || xx >= GW) continue;
        const c = yy * GW + xx;
        const s1 = cellStart[c + 1];
        for (let k = cellStart[c]; k < s1; k++) {
          const j = cellItems[k];
          if (!alive[j] || team[j] === tm || j === skip) continue;
          const tj = type[j], tfl = UFL[tj];
          if (tfl & F.MINE) continue;
          if (tfl & F.AIR) { if (am === 0) continue; } else if (am === 2) continue;
          if (tfl & F.BUILD && !(tfl & F.NEUTRAL)) continue; // buildings via bgrid
          const dx = x[j] - hx, dy = y[j] - hy;
          const d2 = dx * dx + dy * dy, rr = UR[tj] + rad;
          if (d2 < rr * rr && d2 < bd) { bd = d2; best = j; }
        }
      }
    }
    if (best < 0 && am !== 2) {
      if (cx >= 0 && cy >= 0 && cx < GW && cy < GH) {
        const b = bgrid[cy * GW + cx];
        if (b >= 0 && alive[b] && team[b] !== tm && b !== skip) {
          const dx = x[b] - hx, dy = y[b] - hy, rr = UR[type[b]] + rad;
          if (dx * dx + dy * dy < rr * rr) best = b;
        }
      }
    }
    return best;
  }

  // returns true if the projectile was blocked by shield / dodge
  function deflect(j, dirx) {
    const fl = UFL[type[j]];
    if ((fl & F.DODGE) && rnd() < 0.5) return true;
    if ((fl & F.SHIELD) && dirx * face[j] < 0 && rnd() < 0.85) {
      G.fx.spark(x[j] + face[j] * 4, y[j] - 5, 3);
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------- explosions
  function explode(ex, ey, R, dmg, tm, flags) {
    const fire = flags & 1;
    const R2 = R + 8;
    const cx0 = Math.max(0, ((ex - R2) / GC) | 0), cx1 = Math.min(GW - 1, ((ex + R2) / GC) | 0);
    const cy0 = Math.max(0, ((ey - R2) / GC) | 0), cy1 = Math.min(GH - 1, ((ey + R2) / GC) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = cy * GW + cx, s1 = cellStart[c + 1];
      for (let k = cellStart[c]; k < s1; k++) {
        const j = cellItems[k];
        if (!alive[j] || (team[j] === tm && !S.friendlyFire)) continue;
        const tj = type[j], tfj = UFL[tj];
        if ((tfj & F.BUILD) && !(tfj & F.NEUTRAL)) continue;
        if (tfj & F.AIR) continue;
        const dx = x[j] - ex, dy = y[j] - ey;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R + UR[tj]) continue;
        let f = 1 - 0.6 * Math.min(1, d / R);
        if ((flags & 8) && (tfj & F.VEHICLE)) f *= 2.5;
        const m = UMASS[tj];
        if (d > 0.01 && m < 50) { const kb = (160 * f) / Math.sqrt(m); kx[j] += (dx / d) * kb; ky[j] += (dy / d) * kb; stun[j] = Math.max(stun[j], 0.25 * f); }
        if (fire && !(UFL[tj] & F.FIREPROOF)) burn[j] = Math.max(burn[j], 3 + rnd() * 2);
        damage(j, dmg * f, tm, false);
      }
    }
    for (let k = 0; k < blist.length; k++) {
      const b = blist[k];
      if (!alive[b] || (team[b] === tm && !S.friendlyFire)) continue;
      const d = Math.hypot(x[b] - ex, y[b] - ey) - UR[type[b]];
      if (d > R) continue;
      const f = 1 - 0.5 * Math.max(0, d / R);
      damage(b, dmg * f * (flags & 4 ? 2 : 1), tm, false);
      if (fire && UFL[type[b]] & F.FLAMMABLE) burn[b] = Math.max(burn[b], 6);
    }
    // terrain
    const tR = R * 0.8;
    const tx0 = Math.max(0, ((ex - tR) / TC) | 0), tx1 = Math.min(TW - 1, ((ex + tR) / TC) | 0);
    const ty0 = Math.max(0, ((ey - tR) / TC) | 0), ty1 = Math.min(TH - 1, ((ey + tR) / TC) | 0);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const dx = tx * TC + 4 - ex, dy = ty * TC + 4 - ey;
      if (dx * dx + dy * dy > tR * tR) continue;
      const c = ty * TW + tx, tt = terr[c];
      if (tt === T.WALL || tt === T.PALI) damageWall(c, dmg * (flags & 4 ? 3 : 1.2));
      else if (fire && TFUEL[tt] > 0 && rnd() < 0.5) ignite(c);
    }
    G.fx.explosion(ex, ey, R, fire);
  }
  S.explode = explode;

  // --------------------------------------------------------------- terrain / fire
  function damageWall(c, amt) {
    const tt = terr[c];
    if (tt !== T.WALL && tt !== T.PALI) return;
    thp[c] -= amt;
    if (thp[c] <= 0) {
      terr[c] = T.RUBBLE; thp[c] = 0; fireT[c] = 0;
      S.terrDirty = true; S.flowDirty = true;
      G.fx.debris((c % TW) * TC + 4, ((c / TW) | 0) * TC + 4, tt === T.PALI ? 0xff3a5a7a : 0xff8c877d);
    } else if (thp[c] < THP[tt] * 0.5 && !(tvar[c] & 1)) {
      tvar[c] |= 1; S.objDirty = true;
    }
  }
  S.damageWall = damageWall;
  function ignite(c) {
    const tt = terr[c];
    if (TFUEL[tt] <= 0 || fireT[c] > 0) return;
    fireT[c] = TFUEL[tt] * (0.7 + rnd() * 0.6);
    fireList[fireN++] = c;
    S.terrDirty = true;
  }
  S.ignite = ignite;
  function updateFire(dt) {
    let n = fireN;
    for (let k = 0; k < n; k++) {
      const c = fireList[k];
      fireT[c] -= dt;
      const tt = terr[c];
      if (fireT[c] <= 0 || TFUEL[tt] <= 0) {
        fireT[c] = 0;
        if (tt === T.PALI) { terr[c] = T.RUBBLE; S.flowDirty = true; }
        else if (TFUEL[tt] > 0) { if (tt === T.FOREST) tvar[c] |= 2; else tvar[c] &= ~2; terr[c] = T.BURNT; }
        S.terrDirty = true; S.objDirty = true;
        fireList[k] = fireList[--n]; k--;
        continue;
      }
      if (tt === T.PALI) { thp[c] -= 20 * dt; }
      const cx = c % TW, cy = (c / TW) | 0;
      // spread
      for (let d = 0; d < 4; d++) {
        const nx = cx + NDX[d], ny = cy + NDY[d];
        if (nx < 0 || ny < 0 || nx >= TW || ny >= TH) continue;
        const nc = ny * TW + nx, nt = terr[nc];
        if (TFUEL[nt] > 0 && fireT[nc] <= 0 && rnd() < TSPREAD[nt] * dt * (1 + S.wind)) {
          fireList[n++] = nc;
          fireT[nc] = TFUEL[nt] * (0.7 + rnd() * 0.6);
          S.terrDirty = true;
        }
      }
      if (rnd() < 0.3) G.fx.fireCell(cx * TC + 4, cy * TC + 4, tt);
    }
    fireN = n;
    S.fireN = n;
  }
  S.wind = 0;

  // --------------------------------------------------------------- auras
  function stampAuras() {
    aura.fill(0); healm.fill(0);
    for (let i = 0; i < hw; i++) {
      if (!alive[i]) continue;
      const fl = UFL[type[i]];
      if (!(fl & (F.AURA | F.HEALAURA))) continue;
      const tm = team[i];
      if (tm >= 4) continue;
      const R = fl & F.HEALAURA ? 8 : 6;
      const cx = (x[i] / GC) | 0, cy = (y[i] / GC) | 0;
      const map = fl & F.HEALAURA ? healm : aura;
      for (let yy = Math.max(0, cy - R); yy <= Math.min(GH - 1, cy + R); yy++)
        for (let xx = Math.max(0, cx - R); xx <= Math.min(GW - 1, cx + R); xx++)
          if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= R * R) map[(yy * GW + xx) * 4 + tm] = 1;
    }
  }

  // --------------------------------------------------------------- projectiles
  function newProj() {
    if (qfreeTop > 0) return qfree[--qfreeTop];
    if (qhw < MAXP) return qhw++;
    return -1;
  }
  function freeProj(p) { qalive[p] = 0; qfree[qfreeTop++] = p; S.nproj--; }

  const ARC_SPD = []; ARC_SPD[P.ARROW] = 230; ARC_SPD[P.GRENADE] = 140; ARC_SPD[P.STONE] = 210; ARC_SPD[P.JAVELIN] = 200; ARC_SPD[P.SHELL] = 280; ARC_SPD[P.MRL] = 250; ARC_SPD[P.BOMB] = 400;
  const ARC_H = []; ARC_H[P.ARROW] = 0.22; ARC_H[P.GRENADE] = 0.35; ARC_H[P.STONE] = 0.32; ARC_H[P.JAVELIN] = 0.16; ARC_H[P.SHELL] = 0.36; ARC_H[P.MRL] = 0.3; ARC_H[P.BOMB] = 0;
  const IS_ARC = new Uint8Array(32); [P.ARROW, P.GRENADE, P.STONE, P.JAVELIN, P.SHELL, P.MRL, P.BOMB].forEach((k) => (IS_ARC[k] = 1));
  const LIN_SPD = []; LIN_SPD[P.BOLT] = 520; LIN_SPD[P.FIREBALL] = 250; LIN_SPD[P.FLAME] = 190; LIN_SPD[P.BBOLT] = 620; LIN_SPD[P.CANNON] = 430; LIN_SPD[P.SHURIKEN] = 320; LIN_SPD[P.ROCKET] = 320; LIN_SPD[P.MISSILE] = 360; LIN_SPD[P.TSHELL] = 650;

  function fireArc(kind, sx, sy, tx, ty, tm, dmg, aoe, ap, z0 = 6) {
    const p = newProj(); if (p < 0) return -1;
    qz0[p] = z0;
    const d = Math.hypot(tx - sx, ty - sy);
    qkind[p] = kind; qteam[p] = tm; qalive[p] = 1; qdmg[p] = dmg; qaoe[p] = aoe; qap[p] = ap; qsrc[p] = curAtk;
    qsx[p] = sx; qsy[p] = sy; qtx[p] = tx; qty[p] = ty;
    qT[p] = d / ARC_SPD[kind] + 0.12; qt[p] = 0; qh[p] = Math.min(140, d * ARC_H[kind] + 4);
    if (kind === P.BOMB) { qT[p] = Math.max(qT[p], 0.25 + z0 * 0.012); qh[p] = 2; }
    qx[p] = qpx[p] = sx; qy[p] = qpy[p] = sy; qz[p] = qpz[p] = z0;
    qlast[p] = -1; qlastC[p] = -1; qpierce[p] = 0;
    S.nproj++;
    return p;
  }
  function fireLin(kind, sx, sy, dirx, diry, tm, dmg, aoe, ap, range, pierce, z0) {
    const p = newProj(); if (p < 0) return -1;
    qtg[p] = -1;
    const sp = LIN_SPD[kind];
    qkind[p] = kind; qteam[p] = tm; qalive[p] = 1; qdmg[p] = dmg; qaoe[p] = aoe; qap[p] = ap; qsrc[p] = curAtk;
    qx[p] = qpx[p] = sx; qy[p] = qpy[p] = sy; qz[p] = qpz[p] = z0 != null ? z0 : kind === P.CANNON ? 4 : 6;
    qvx[p] = dirx * sp; qvy[p] = diry * sp;
    qT[p] = range / sp; qt[p] = 0; qh[p] = 0;
    qsx[p] = sx; qsy[p] = sy;
    qlast[p] = -1; qlastC[p] = -1; qpierce[p] = pierce;
    S.nproj++;
    return p;
  }
  S.fireArc = fireArc; S.fireLin = fireLin;

  function hitscan(i, j, dmg, spread, ap) {
    curAtk = type[i];
    const am = UFL[type[j]] & F.AIR ? 2 : 0;
    const za = UALT[type[i]], zb = UALT[type[j]];
    const sx = x[i] + face[i] * 4, sy = y[i] - 6 - za;
    let ang = Math.atan2(y[j] - y[i], x[j] - x[i]) + (rnd() - 0.5) * 2 * spread;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const range = URNG[type[i]] * 1.15;
    const tm = team[i];
    let hx = sx, hy = sy, lastT = -1, hit = -1;
    for (let s = 0; s < range; s += 4) {
      hx = x[i] + dx * s; hy = y[i] + dy * s;
      if (hx < 0 || hy < 0 || hx >= W || hy >= H) break;
      const c = ((hy / TC) | 0) * TW + ((hx / TC) | 0);
      if (c !== lastT) {
        lastT = c;
        const tt = terr[c];
        if (TBLK[tt] === 1) { if (tt === T.WALL || tt === T.PALI) damageWall(c, dmg * 0.25); break; }
        if (tt === T.FOREST && s > 12 && rnd() < 0.3) break;
      }
      if (s < 6) continue;
      const k = hitAt(hx, hy, am ? 3 : 1, tm, i, am);
      if (k >= 0) {
        // small arms are bad at hitting aircraft; dedicated AA is not
        const fs = UFL[type[i]];
        const pAir = fs & F.AAONLY ? 1 : fs & (F.VEHICLE | F.BUILD) ? 0.45 : 0.2;
        if (am && rnd() > pAir) break;
        if (!deflect(k, dx)) { hit = k; damage(k, dmg, tm, ap); }
        break;
      }
    }
    G.fx.tracer(sx, sy, hx, hy - 4 - zb);
    if (UCD[type[i]] > 0.3 || rnd() < 0.25) G.fx.muzzle(sx + dx * 3, sy + dy * 3, face[i], UCD[type[i]] > 0.3 ? 1 : 0.5);
    if (hit >= 0 && !(UFL[type[hit]] & (F.VEHICLE | F.BUILD | F.AIR))) G.fx.blood(hx, hy, 1);
    else if (hit >= 0) G.fx.spark(hx, hy - zb - 3, 1);
  }

  function updateProjectiles(dt) {
    for (let p = 0; p < qhw; p++) {
      if (!qalive[p]) continue;
      const kind = qkind[p];
      qpx[p] = qx[p]; qpy[p] = qy[p]; qpz[p] = qz[p];
      qt[p] += dt;
      if (IS_ARC[kind]) {
        const f = Math.min(1, qt[p] / qT[p]);
        qx[p] = qsx[p] + (qtx[p] - qsx[p]) * f;
        qy[p] = qsy[p] + (qty[p] - qsy[p]) * f;
        qz[p] = qh[p] * 4 * f * (1 - f) + qz0[p] * (1 - (kind === P.BOMB ? f * f : f));
        if (f >= 1) { landArc(p); }
        continue;
      }
      // straight
      curAtk = qsrc[p];
      if (kind === P.MISSILE) {
        const j = qtg[p];
        if (j >= 0 && alive[j]) {
          const dx = x[j] - qx[p], dy = y[j] - qy[p], l = Math.hypot(dx, dy) || 1;
          const v = LIN_SPD[kind] * (1 + qt[p]);
          qvx[p] += ((dx / l) * v - qvx[p]) * 0.25; qvy[p] += ((dy / l) * v - qvy[p]) * 0.25;
          qz[p] += (UALT[type[j]] - qz[p]) * 0.1;
          if (l < UR[type[j]] + 4) { curAtk = qsrc[p]; damage(j, qdmg[p], qteam[p], true); G.fx.explosion(qx[p], qy[p] - qz[p], 14, 1); freeProj(p); continue; }
        }
      }
      const sp = Math.hypot(qvx[p], qvy[p]);
      const steps = Math.max(1, Math.ceil((sp * dt) / 5));
      const sdt = dt / steps;
      const tm = qteam[p];
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        qx[p] += qvx[p] * sdt; qy[p] += qvy[p] * sdt;
        const hx = qx[p], hy = qy[p];
        if (hx < 0 || hy < 0 || hx >= W || hy >= H) { done = true; endLin(p, false); break; }
        const c = ((hy / TC) | 0) * TW + ((hx / TC) | 0);
        if (c !== qlastC[p] && kind !== P.MISSILE && qz[p] < 12) {
          qlastC[p] = c;
          const tt = terr[c];
          if (TBLK[tt] === 1) {
            if (tt === T.WALL || tt === T.PALI) damageWall(c, qdmg[p] * (kind === P.CANNON || kind === P.BBOLT ? 2 : 0.3));
            if (kind === P.FLAME && tt === T.PALI) ignite(c);
            done = true; endLin(p, true); break;
          }
          if (kind === P.FLAME) { if (TFUEL[tt] > 0 && rnd() < 0.05) ignite(c); if (TWATER[tt]) { done = true; freeProj(p); break; } }
          else if (tt === T.FOREST && kind !== P.CANNON && rnd() < 0.35) { done = true; endLin(p, true); break; }
        }
        if (kind === P.MISSILE) continue;
        const rad = kind === P.FLAME ? 3 : kind === P.FIREBALL ? 3 : kind === P.CANNON ? 2.5 : kind === P.ROCKET || kind === P.TSHELL ? 2.5 : 1.5;
        const j = hitAt(hx, hy, rad, tm, qlast[p], kind === P.ROCKET ? 1 : 0);
        if (j >= 0) {
          qlast[p] = j;
          const dirx = qvx[p];
          const isB = UFL[type[j]] & F.BUILD;
          if (kind === P.FLAME) {
            damage(j, qdmg[p], tm, true);
            if (!(UFL[type[j]] & F.FIREPROOF)) burn[j] = Math.max(burn[j], 2.5 + rnd() * 2);
            if (qpierce[p]-- <= 0) { done = true; freeProj(p); }
            break;
          }
          if (kind === P.FIREBALL) { done = true; endLin(p, true); break; }
          if (kind === P.ROCKET || kind === P.TSHELL) {
            const tf2 = UFL[type[j]];
            if (!(tf2 & (F.BUILD | F.VEHICLE | F.AIR)) && deflect(j, dirx)) { done = true; freeProj(p); break; }
            const heavy = tf2 & (F.BUILD | F.VEHICLE | F.AIR);
            damage(j, qdmg[p] * (heavy ? (kind === P.ROCKET ? 2.5 : 1.5) : 1), tm, kind === P.TSHELL);
            if (tf2 & F.AIR) { G.fx.explosion(hx, hy - UALT[type[j]], 12, 1); freeProj(p); }
            else endLin(p, true);
            done = true; break;
          }
          if (!isB && kind !== P.CANNON && deflect(j, dirx)) {
            if (kind === P.BBOLT && qpierce[p] > 0) { qpierce[p] = 0; continue; }
            done = true; freeProj(p); break;
          }
          const m = isB ? (kind === P.CANNON || kind === P.BBOLT ? 2.5 : 1) : 1;
          damage(j, qdmg[p] * m, tm, qap[p] === 1);
          if (!isB) {
            G.fx.blood(hx, hy, kind === P.CANNON ? 4 : 1);
            if (kind === P.CANNON || kind === P.BBOLT) {
              const mm = Math.sqrt(UMASS[type[j]]);
              kx[j] += (qvx[p] / sp) * 120 / mm; ky[j] += (qvy[p] / sp) * 120 / mm; stun[j] = Math.max(stun[j], 0.3);
            }
          }
          if (qpierce[p] > 0 && !isB) {
            qpierce[p]--;
            qdmg[p] *= kind === P.CANNON ? 0.85 : 0.9;
            if (kind === P.CANNON) { qvx[p] *= 0.93; qvy[p] *= 0.93; }
          } else { done = true; endLin(p, kind === P.CANNON); }
        }
      }
      if (done) continue;
      if (kind === P.CANNON) qz[p] = 1 + Math.abs(Math.sin(qt[p] * 9)) * 6 * Math.max(0, 1 - qt[p] / qT[p]);
      else if (kind !== P.MISSILE && qz[p] > 7) qz[p] += (5 - qz[p]) * 0.1;
      if (qt[p] >= qT[p]) endLin(p, kind === P.FIREBALL || kind === P.CANNON || kind === P.ROCKET || kind === P.TSHELL);
    }
  }
  function endLin(p, impact) {
    if (!qalive[p]) return;
    const kind = qkind[p];
    if (kind === P.FIREBALL) { S.explQ.push(qx[p], qy[p], qaoe[p] || 28, qdmg[p], qteam[p], 1, qsrc[p]); }
    else if (kind === P.CANNON) { S.explQ.push(qx[p], qy[p], 20, qdmg[p] * 0.5, qteam[p], 4, qsrc[p]); }
    else if (kind === P.ROCKET) { S.explQ.push(qx[p], qy[p], qaoe[p] || 18, qdmg[p] * 0.45, qteam[p], 8, qsrc[p]); }
    else if (kind === P.TSHELL) { S.explQ.push(qx[p], qy[p], qaoe[p] || 24, qdmg[p] * 0.55, qteam[p], 4 | 8, qsrc[p]); }
    else if (kind === P.MISSILE) { G.fx.explosion(qx[p], qy[p] - qz[p], 12, 1); }
    else if (kind === P.FLAME) { if (rnd() < 0.25) ignite(tcell(Math.max(0, Math.min(W - 1, qx[p])), Math.max(0, Math.min(H - 1, qy[p])))); }
    else if (impact) G.fx.spark(qx[p], qy[p], 2);
    freeProj(p);
  }
  function landArc(p) {
    curAtk = qsrc[p];
    const kind = qkind[p], tm = qteam[p];
    const lx = qx[p], ly = qy[p];
    if (kind === P.GRENADE) { S.explQ.push(lx, ly, qaoe[p], qdmg[p], tm, 0, qsrc[p]); freeProj(p); return; }
    if (kind === P.SHELL || kind === P.MRL || kind === P.BOMB) {
      S.explQ.push(lx, ly, qaoe[p], qdmg[p], tm, kind === P.MRL ? 8 : 4 | 8, qsrc[p]);
      if (kind !== P.MRL || rnd() < 0.3) G.fx.decal(G.FR.crater, lx, ly, qaoe[p] * 0.8, qaoe[p] * 0.55, 0, 0x90ffffff);
      freeProj(p); return;
    }
    if (kind === P.STONE) {
      S.explQ.push(lx, ly, qaoe[p], qdmg[p], tm, 4, qsrc[p]);
      G.fx.decal(G.FR.crater, lx, ly, qaoe[p] * 0.9, qaoe[p] * 0.6, 0, 0xffffffff);
      freeProj(p); return;
    }
    if (lx >= 0 && ly >= 0 && lx < W && ly < H && terr[tcell(lx, ly)] === T.FOREST && rnd() < 0.4) { freeProj(p); return; }
    const j = hitAt(lx, ly, kind === P.JAVELIN ? 3 : 2.5, tm, -1);
    if (j >= 0) {
      const dirx = qtx[p] - qsx[p];
      if (!(UFL[type[j]] & F.BUILD) && deflect(j, dirx)) { freeProj(p); return; }
      const dealt = damage(j, qdmg[p] * (kind === P.JAVELIN && UARM[type[j]] >= 3 ? 1.6 : 1), tm, kind === P.JAVELIN);
      if (dealt > 0 && !(UFL[type[j]] & F.BUILD)) G.fx.blood(lx, ly, 1);
    } else if (lx >= 0 && ly >= 0 && lx < W && ly < H && !TWATER[terr[tcell(lx, ly)]]) {
      if (rnd() < 0.5) G.fx.decal(G.FR.stuck, lx, ly, 5, 2, Math.atan2(qty[p] - qsy[p], qtx[p] - qsx[p]) + (rnd() - 0.5) * 0.5, 0xffffffff);
    }
    freeProj(p);
  }

  // --------------------------------------------------------------- attacks
  function shoot(i, j) {
    curAtk = type[i];
    const t = type[i], kind = UPROJ[t], tm = team[i];
    let dmg = UDMG[t] * (buffed[i] ? 1.3 : 1);
    const ap = UFL[t] & F.AP ? 1 : 0;
    const dx = x[j] - x[i], dy = y[j] - y[i];
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    atk[i] = 0.3;
    if (dx !== 0) face[i] = dx > 0 ? 1 : -1;
    const isB = UFL[t] & F.BUILD;
    let sx = x[i], sy = y[i] - (isB ? 0 : 6) - UALT[t];
    if (isB) {
      // shoot from a random spot on the building
      const r = UR[t];
      sx += (rnd() - 0.5) * r * 1.2; sy -= r * 0.4 + rnd() * r * 0.6;
    }
    // target velocity for leading
    const tvx = (x[j] - px[j]) / DT, tvy = (y[j] - py[j]) / DT;
    let kd = kind;
    const tfj = UFL[type[j]];
    if (G.UNITS[t].k === 'heli' && !(tfj & (F.VEHICLE | F.BUILD | F.AIR))) { kd = P.BULLET; dmg = 10; shotCd = 0.16; }
    switch (kd) {
      case P.SHELL: case P.MRL: {
        const n = kd === P.MRL ? 8 : 1;
        for (let k = 0; k < n; k++) {
          const T0 = d / ARC_SPD[kd] + 0.12;
          const spr = kd === P.MRL ? d * 0.07 + 18 : d * 0.04 + 6;
          const a = rnd() * 6.283, rr = rnd() * spr;
          fireArc(kd, sx + (rnd() - 0.5) * 4, sy, x[j] + tvx * T0 + Math.cos(a) * rr, y[j] + tvy * T0 + Math.sin(a) * rr, tm, dmg, UAOE[t], ap, 10);
        }
        G.fx.muzzle(sx + face[i] * 10, sy - 6, face[i], kd === P.MRL ? 2.5 : 2);
        G.fx.dust(x[i], y[i], 4);
        break;
      }
      case P.ROCKET: case P.TSHELL: case P.MISSILE: {
        const sp = LIN_SPD[kd];
        const T0 = d / sp;
        const ax = x[j] + tvx * T0 - x[i], ay = y[j] + tvy * T0 - y[i];
        const al = Math.hypot(ax, ay) || 1;
        const an = Math.atan2(ay, ax) + (rnd() - 0.5) * (kd === P.MISSILE ? 0.4 : 0.06);
        const z0 = UALT[t] + (isB ? 6 : 6);
        const p = fireLin(kd, sx, sy + UALT[t], Math.cos(an), Math.sin(an), tm, dmg, UAOE[t], 0, kd === P.MISSILE ? URNG[t] * 2.5 : Math.min(URNG[t] * 1.2, al + 30), 0, z0);
        if (p >= 0 && kd === P.MISSILE) { qtg[p] = j; qvx[p] *= 0.4; qvy[p] = qvy[p] * 0.4 - 60; }
        G.fx.muzzle(sx + Math.cos(an) * 8, sy + Math.sin(an) * 8, face[i], kd === P.TSHELL ? 2 : 1.2);
        if (kd === P.ROCKET && !UALT[t]) G.fx.smokePuff(x[i] - face[i] * 6, y[i] - 6, 2);
        break;
      }
      case P.BOMB: {
        fireArc(P.BOMB, x[i], y[i], x[i] + (x[i] - px[i]) * 8, y[i] + (y[i] - py[i]) * 8, tm, dmg, UAOE[t], 0, UALT[t]);
        break;
      }
      case P.ARROW: case P.GRENADE: case P.STONE: case P.JAVELIN: {
        let T0 = d / ARC_SPD[kind] + 0.12;
        let tx = x[j] + tvx * T0, ty = y[j] + tvy * T0;
        const sp = kind === P.ARROW ? d * 0.035 + 1.5 : kind === P.STONE ? d * 0.05 + 4 : kind === P.GRENADE ? d * 0.06 : d * 0.03 + 1;
        const a = rnd() * 6.283, rr = rnd() * sp;
        tx += Math.cos(a) * rr; ty += Math.sin(a) * rr;
        fireArc(kind, sx, sy, tx, ty, tm, dmg, UAOE[t], ap);
        if (kind === P.STONE) G.fx.dust(x[i], y[i], 6);
        break;
      }
      case P.BOLT: case P.FIREBALL: case P.BBOLT: case P.CANNON: case P.SHURIKEN: {
        const sp = LIN_SPD[kind];
        const T0 = d / sp;
        let tx = x[j] + tvx * T0, ty = y[j] + tvy * T0;
        let ax = tx - x[i], ay = ty - y[i];
        const al = Math.hypot(ax, ay) || 1;
        const spread = kind === P.CANNON ? 0.03 : kind === P.BBOLT ? 0.02 : 0.04;
        const an = Math.atan2(ay, ax) + (rnd() - 0.5) * spread * 2;
        const range = kind === P.FIREBALL ? Math.min(al, URNG[t] * 1.1) : URNG[t] * (kind === P.CANNON ? 1.4 : 1.15);
        fireLin(kind, sx, sy, Math.cos(an), Math.sin(an), tm, kind === P.SHURIKEN ? 9 : dmg, UAOE[t], ap, range, kind === P.BBOLT ? 8 : kind === P.CANNON ? 14 : 0);
        if (kind === P.CANNON) { G.fx.muzzle(sx + Math.cos(an) * 10, sy + Math.sin(an) * 10 - 2, face[i], 2.2); }
        break;
      }
      case P.FLAME: {
        const an = Math.atan2(dy, dx) + (rnd() - 0.5) * 0.45;
        fireLin(P.FLAME, sx + face[i] * 5, sy + 1, Math.cos(an), Math.sin(an), tm, dmg, 0, 1, URNG[t] * (0.85 + rnd() * 0.3), 2);
        break;
      }
      case P.BULLET: {
        const k = G.UNITS[t].k;
        const spread = UFL[t] & F.PICKY ? 0.004 : k === 'mg' || k === 'jeep' ? 0.09 : k === 'aa' ? 0.035 : 0.05;
        hitscan(i, j, dmg, spread, ap);
        break;
      }
    }
  }

  let shotCd = -1;
  function nextCd(t) { const c = shotCd >= 0 ? shotCd : UCD[t]; shotCd = -1; return c; }
  function melee(i, j, mult) {
    curAtk = type[i];
    const t = type[i], fl = UFL[t], tj = type[j];
    let dmg = UDMG[t] * mult;
    if (buffed[i]) dmg *= 1.3;
    if (fl & F.BERSERK) dmg *= 1 + 1.5 * (1 - hp[i] / UHP[t]);
    if ((fl & F.ANTICAV) && (UFL[tj] & F.MOUNTED)) dmg *= 3;
    if ((UFL[tj] & F.BUILD) && (fl & F.SIEGE)) dmg *= 1.5;
    atk[i] = 0.28;
    const dx = x[j] - x[i];
    if (dx !== 0) face[i] = dx > 0 ? 1 : -1;
    const dealt = damage(j, dmg, team[i], false);
    if (fl & F.LIFESTEAL) hp[i] = Math.min(UHP[t], hp[i] + dealt * 0.3);
    if (!(UFL[tj] & F.BUILD)) { if (rnd() < 0.5) G.fx.blood(x[j], y[j], 1); }
    else if (rnd() < 0.4) G.fx.spark(x[j] - face[i] * UR[tj] * 0.5, y[j] - 4, 1);
    if (fl & F.CLEAVE) {
      const reach = UREACH[t] + UR[t] + 6;
      const cx = (x[i] / GC) | 0, cy = (y[i] / GC) | 0, tm = team[i];
      let n = 0;
      for (let yy = cy - 1; yy <= cy + 1 && n < 6; yy++) {
        if (yy < 0 || yy >= GH) continue;
        for (let xx = cx - 1; xx <= cx + 1 && n < 6; xx++) {
          if (xx < 0 || xx >= GW) continue;
          const c = yy * GW + xx, s1 = cellStart[c + 1];
          for (let k = cellStart[c]; k < s1 && n < 6; k++) {
            const o = cellItems[k];
            if (o === j || !alive[o] || team[o] === tm || team[o] === NEUTRAL) continue;
            const ox = x[o] - x[i], oy = y[o] - y[i];
            if (ox * face[i] < -1) continue;
            if (ox * ox + oy * oy > (reach + UR[type[o]]) ** 2) continue;
            damage(o, dmg * 0.7, tm, false); n++;
          }
        }
      }
    }
  }

  // --------------------------------------------------------------- per-unit AI
  let mvx = 0, mvy = 0, mvs = 1; // output of behaviour: direction & speed factor

  function followFlow(i, slow) {
    const tm = team[i];
    if (tm >= 4) { mvx = mvy = 0; return; }
    if (S.stance[tm] === 1) { const b = UBEH[type[i]]; if (b !== B.SAPPER && b !== B.RAM) { mvx = mvy = 0; mvs = 0; return; } }
    const c = cellOf[i];
    mvx = fdx[tm][c]; mvy = fdy[tm][c];
    // tiny lateral noise to avoid perfect columns
    const n = ((i * 7919) % 13) / 13 - 0.5;
    mvx += -mvy * n * 0.3; mvy += mvx * n * 0.3;
    mvs = slow || 1;
  }
  function toward(i, j, s) {
    const dx = x[j] - x[i], dy = y[j] - y[i];
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    mvx = dx / d; mvy = dy / d; mvs = s || 1;
  }
  function away(i, j, s) {
    const dx = x[i] - x[j], dy = y[i] - y[j];
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    mvx = dx / d; mvy = dy / d; mvs = s || 1;
  }
  function edgeDist(i, j) {
    const dx = x[j] - x[i], dy = y[j] - y[i];
    return Math.sqrt(dx * dx + dy * dy) - UR[type[i]] - UR[type[j]];
  }
  function validEnemy(i, j) {
    return j >= 0 && alive[j] && team[j] !== team[i] && team[j] !== NEUTRAL;
  }

  function wallAttack(i) {
    curAtk = type[i];
    const c = wallC[i];
    if (c < 0) return false;
    const tt = terr[c];
    if (tt !== T.WALL && tt !== T.PALI) { wallC[i] = -1; return false; }
    // only break through when the flow field says so (pass-2 region)
    const tm = team[i];
    if (tm < 4 && !fp2[tm][cellOf[i]] && UBEH[type[i]] !== B.RAM) return false;
    mvx = mvy = 0;
    if (cd[i] <= 0) {
      const t = type[i];
      let d = Math.max(UDMG[t], 8) * (UFL[t] & F.SIEGE ? 3 : 1);
      if (UBEH[t] === B.SAPPER) { kill(i, -1); return true; }
      damageWall(c, d);
      cd[i] = Math.max(UCD[type[i]], 0.8);
      atk[i] = 0.28;
      const wx = (c % TW) * TC + 4;
      face[i] = wx > x[i] ? 1 : -1;
      if (rnd() < 0.5) G.fx.debris(wx, ((c / TW) | 0) * TC + 4, tt === T.PALI ? 0xff4a6a8a : 0xff8c877d, 2);
    }
    return true;
  }

  function behave(i, t, fl) {
    const beh = UBEH[t];
    let tg = tgt[i];
    const tick = S.tick;
    mvx = mvy = 0; mvs = 1;

    // ---------- panic / flee
    if (flee[i] > 0 && !buffed[i]) {
      flee[i] -= DT;
      const tm = team[i];
      if (tm < 4) { const c = cellOf[i]; mvx = -fdx[tm][c]; mvy = -fdy[tm][c]; }
      if (mvx === 0 && mvy === 0) { if (dX[i] === 0 && dY[i] === 0) { const a = rnd() * 6.28; dX[i] = Math.cos(a); dY[i] = Math.sin(a); } mvx = dX[i]; mvy = dY[i]; }
      mvs = 1.15;
      return;
    }
    if (burn[i] > 0 && !(fl & (F.BRAVE | F.FIREPROOF | F.SIEGE))) {
      if ((tick + i) % 12 === 0 || (dX[i] === 0 && dY[i] === 0)) { const a = rnd() * 6.28; dX[i] = Math.cos(a); dY[i] = Math.sin(a); }
      mvx = dX[i]; mvy = dY[i]; mvs = 1.25;
      return;
    }

    // ---------- (re)targeting
    const stag = (tick + i) & 15;
    if (beh === B.HEAL) {
      if (stag === 0 || (tg >= 0 && (!alive[tg] || hp[tg] >= UHP[type[tg]]))) tg = tgt[i] = findTarget(i, UVIS[t], 1);
      if (stag === 8 || (tgt2[i] >= 0 && !alive[tgt2[i]])) tgt2[i] = findTarget(i, 90, 0);
    } else if (beh === B.RAM) {
      if (stag === 0 || !validEnemy(i, tg)) tg = tgt[i] = nearestEnemyBuilding(i, UVIS[t]);
    } else if (state[i] === 9) {
      // peasant repairing a friendly building
      if (!alive[tg] || team[tg] !== team[i] || hp[tg] >= UHP[type[tg]]) { state[i] = 0; tg = tgt[i] = -1; }
    } else if (!validEnemy(i, tg) || (stag === 0 && (((tick + i) & 16) === 0 || cd[i] < -0.5))) {
      if (!validEnemy(i, tg) && stag !== 0 && ((tick + i) & 3) !== 0) {
        tg = -1; // wait a little before an expensive search
      } else {
        let nt = -1;
        if (fl & F.PREFBUILD) {
          nt = nearestEnemyBuilding(i, beh === B.SAPPER ? UVIS[t] : URNG[t]);
          if (nt < 0) nt = findTarget(i, beh === B.SAPPER ? 260 : UVIS[t], 0);
        } else nt = findTarget(i, S.stance[team[i]] === 1 ? (beh === B.RANGED ? Math.min(UVIS[t], URNG[t] + 4) : Math.min(UVIS[t], 110)) : UVIS[t], 0);
        tg = tgt[i] = nt;
        if (beh === B.SUPPORT) tgt2[i] = nt;
        if ((fl & F.REPAIR) && stag === 0) {
          const nb = damagedFriendlyBuilding(i, 260);
          if (nb >= 0 && (nt < 0 || edgeDist(i, nt) > 80)) { state[i] = 9; tg = tgt[i] = nb; }
        }
      }
    }

    // ---------- morale check (staggered)
    if (((tick + i) & 31) === 5 && !(fl & F.BRAVE) && !buffed[i] && team[i] < 4) {
      const cx = (x[i] / GC) | 0, cy = (y[i] / GC) | 0, tm = team[i];
      let al = 0, en = 0;
      for (let yy = Math.max(0, cy - 2); yy <= Math.min(GH - 1, cy + 2); yy++)
        for (let xx = Math.max(0, cx - 2); xx <= Math.min(GW - 1, cx + 2); xx++) {
          const b = (yy * GW + xx) * NT;
          for (let k = 0; k < 4; k++) { if (k === tm) al += tcount[b + k]; else en += tcount[b + k]; }
        }
      const hpf = hp[i] / UHP[t];
      if ((fl & F.COWARD && en > al * 1.4 + 1) || (en > al * 2.5 + 3 && hpf < 0.5)) { flee[i] = 1.5 + rnd() * 2; return; }
    }

    // ---------- behaviours
    switch (beh) {
      case B.MELEE: {
        if (state[i] === 9 && tg >= 0) { // repair
          const d = edgeDist(i, tg);
          if (d > 4) toward(i, tg);
          else if (cd[i] <= 0) { hp[tg] = Math.min(UHP[type[tg]], hp[tg] + 14); cd[i] = 1; atk[i] = 0.28; face[i] = x[tg] > x[i] ? 1 : -1; if (rnd() < 0.5) G.fx.heal(x[tg] + (rnd() - 0.5) * UR[type[tg]], y[tg] - UR[type[tg]] * 0.8); }
          return;
        }
        if (tg >= 0) {
          const d = edgeDist(i, tg);
          if (d <= UREACH[t] + 1.5) {
            if (cd[i] <= 0) {
              melee(i, tg, 1);
              let c = UCD[t] * (0.85 + rnd() * 0.3);
              if (fl & F.BERSERK) c *= 0.5 + 0.5 * (hp[i] / UHP[t]);
              if (buffed[i]) c *= 0.8;
              cd[i] = c;
            }
            mvs = 0;
            return;
          }
          if (stuck[i] > 0) { followFlow(i); return; }
          toward(i, tg);
          if (fl & F.BERSERK) mvs = 1 + 0.6 * (1 - hp[i] / UHP[t]);
          return;
        }
        if (wallAttack(i)) return;
        followFlow(i);
        return;
      }
      case B.RANGED: {
        if (tg >= 0) {
          const dx = x[tg] - x[i], dy = y[tg] - y[i];
          const dc = Math.sqrt(dx * dx + dy * dy);
          const d = dc - UR[type[tg]];
          const kite = (fl & F.KITE) && d < (fl & (F.MOUNTED | F.VEHICLE) ? 95 : 42) && !(UFL[type[tg]] & F.BUILD) && UBEH[type[tg]] !== B.RANGED;
          if (kite) {
            away(i, tg, 1);
            if ((fl & F.MOVESHOOT) && cd[i] <= 0 && d <= URNG[t]) { shoot(i, tg); cd[i] = nextCd(t) * (0.9 + rnd() * 0.2); }
            else if (cd[i] <= 0 && d < 8) { melee(i, tg, 0.5); cd[i] = 1; }
            return;
          }
          if (d > URNG[t]) {
            if (stuck[i] > 0) followFlow(i); else toward(i, tg);
            if ((fl & F.MOVESHOOT) && cd[i] <= 0 && d < URNG[t] * 1.1) { shoot(i, tg); cd[i] = nextCd(t); }
            return;
          }
          if (d < UMINR[t]) { away(i, tg, 0.8); return; }
          if (cd[i] <= 0) {
            shoot(i, tg);
            let c = nextCd(t) * (0.9 + rnd() * 0.2);
            if (buffed[i]) c *= 0.8;
            cd[i] = c;
          }
          face[i] = dx > 0 ? 1 : -1;
          return;
        }
        if (wallAttack(i)) return;
        followFlow(i);
        return;
      }
      case B.CAV: {
        // state 0 approach/charge, 1 overrun
        if (state[i] === 1) {
          aux2[i] -= DT;
          mvx = dX[i]; mvy = dY[i]; mvs = 1.1;
          if (aux2[i] <= 0) { state[i] = 0; tgt[i] = -1; }
          return;
        }
        if (tg >= 0) {
          const d = edgeDist(i, tg);
          if (d <= UREACH[t] + 2) {
            const ch = aux[i];
            if (ch > 0.45) {
              const tj = type[tg];
              if ((UFL[tj] & F.ANTICAV) && rnd() < 0.7) {
                damage(i, 40, team[tg], false); stun[i] = 0.7; aux[i] = 0; atk[tg] = 0.3;
                G.fx.spark(x[i], y[i] - 6, 3);
                cd[i] = UCD[t];
                return;
              }
              melee(i, tg, 1 + 1.6 * ch);
              const m = Math.sqrt(UMASS[tj]);
              if (UMASS[tj] < 50) { const dx = x[tg] - x[i], dy = y[tg] - y[i], l = Math.hypot(dx, dy) || 1; kx[tg] += (dx / l) * 150 * ch / m; ky[tg] += (dy / l) * 150 * ch / m; stun[tg] = Math.max(stun[tg], 0.35); }
              // overrun: keep heading
              const dx = x[tg] - x[i], dy = y[tg] - y[i], l = Math.hypot(dx, dy) || 1;
              dX[i] = dx / l; dY[i] = dy / l;
              state[i] = 1; aux2[i] = 0.9 + rnd() * 0.5; aux[i] = 0.25;
              cd[i] = UCD[t];
              return;
            }
            if (cd[i] <= 0) { melee(i, tg, 1); cd[i] = UCD[t] * (0.85 + rnd() * 0.3); }
            aux[i] = Math.max(0, aux[i] - DT);
            // disengage to build a new charge after a while
            aux2[i] += DT;
            if (aux2[i] > 2.5) { const dx = x[i] - x[tg], dy = y[i] - y[tg], l = Math.hypot(dx, dy) || 1; dX[i] = dx / l; dY[i] = dy / l; state[i] = 1; aux2[i] = 1.4; }
            mvs = 0;
            return;
          }
          aux2[i] = 0;
          if (stuck[i] > 0) followFlow(i); else toward(i, tg);
          aux[i] = Math.min(1, aux[i] + DT * 0.7);
          mvs = 0.55 + 0.6 * aux[i];
          return;
        }
        if (wallAttack(i)) return;
        followFlow(i);
        aux[i] = Math.min(1, aux[i] + DT * 0.4);
        mvs = 0.6 + 0.4 * aux[i];
        return;
      }
      case B.HEAL: {
        const th = tgt2[i];
        if (th >= 0 && alive[th] && edgeDist(i, th) < 55) { away(i, th, 1.1); return; }
        if (tg >= 0) {
          const d = edgeDist(i, tg);
          if (d > URNG[t] * 0.8) { toward(i, tg); return; }
          if (cd[i] <= 0) {
            const tt = type[tg];
            hp[tg] = Math.min(UHP[tt], hp[tg] + UHEAL[t] * UCD[t] * (buffed[i] ? 1.3 : 1));
            cd[i] = UCD[t]; atk[i] = 0.3; face[i] = x[tg] > x[i] ? 1 : -1;
            if (rnd() < 0.35) G.fx.heal(x[tg], y[tg] - 8);
          }
          return;
        }
        followFlow(i, 0.6);
        if (th >= 0 && alive[th] && edgeDist(i, th) < 120) mvs = 0;
        return;
      }
      case B.SUPPORT: {
        if (tg >= 0) {
          const d = edgeDist(i, tg);
          if (d < 6 && cd[i] <= 0) { melee(i, tg, 1); cd[i] = UCD[t]; mvs = 0; return; }
          if (d < 100) { away(i, tg, 0.9); return; }
          if (d < 140) { mvs = 0; atk[i] = (S.tick & 7) < 4 ? 0.2 : 0; return; }
        }
        followFlow(i, 0.85);
        if ((S.tick & 7) < 2) atk[i] = 0.15;
        return;
      }
      case B.NINJA: {
        aux[i] -= DT; aux2[i] -= DT;
        if (tg >= 0) {
          const d = edgeDist(i, tg);
          if (d > 70 && aux[i] <= 0) {
            // blink behind the target
            const dx = x[tg] - x[i], dy = y[tg] - y[i], l = Math.hypot(dx, dy) || 1;
            const nx = x[tg] + (dx / l) * (UR[type[tg]] + 6), ny = y[tg] + (dy / l) * (UR[type[tg]] + 6);
            if (!blockedAt(nx, ny)) {
              G.fx.smokePuff(x[i], y[i], 4);
              x[i] = px[i] = nx; y[i] = py[i] = ny;
              G.fx.smokePuff(nx, ny, 4);
              aux[i] = 4 + rnd() * 2;
              face[i] = dx > 0 ? -1 : 1;
              return;
            }
            aux[i] = 1;
          }
          if (d <= UREACH[t] + 1.5) {
            if (cd[i] <= 0) { melee(i, tg, 1); cd[i] = UCD[t] * (0.8 + rnd() * 0.4); }
            mvs = 0; return;
          }
          if (d < URNG[t] && d > 30 && aux2[i] <= 0) { shoot(i, tg); aux2[i] = 1.2 + rnd(); }
          toward(i, tg);
          return;
        }
        if (wallAttack(i)) return;
        followFlow(i);
        return;
      }
      case B.SAPPER: {
        if (tg >= 0) {
          const d = edgeDist(i, tg);
          if (d <= 5) {
            kill(i, -1); // the death explosion is the attack
            return;
          }
          if (stuck[i] > 0) followFlow(i, 1.05); else toward(i, tg, 1.05);
          return;
        }
        if (wallAttack(i)) return;
        followFlow(i);
        return;
      }
      case B.DRONEK: {
        if (tg >= 0) {
          if (edgeDist(i, tg) <= 3) { kill(i, -1); return; }
          toward(i, tg, 1);
          return;
        }
        followFlow(i);
        return;
      }
      case B.DRONEB: {
        if (tg >= 0) {
          if (cd[i] > 1.2) { away(i, tg, 0.9); return; }
          const dx = x[tg] - x[i], dy = y[tg] - y[i];
          if (dx * dx + dy * dy < 100) {
            if (cd[i] <= 0) { shoot(i, tg); cd[i] = UCD[t] * (0.9 + rnd() * 0.2); }
          }
          toward(i, tg, 1);
          return;
        }
        followFlow(i);
        return;
      }
      case B.JET: {
        if (dX[i] === 0 && dY[i] === 0) { dX[i] = x[i] < W / 2 ? 1 : -1; }
        mvs = 1;
        if (state[i] === 1) {
          aux2[i] -= DT;
          if (aux2[i] <= 0) { state[i] = 0; tgt[i] = -1; }
        } else if (tg >= 0) {
          const dx = x[tg] - x[i], dy = y[tg] - y[i], l = Math.hypot(dx, dy) || 1;
          // limited turn rate
          let hx = dX[i] + (dx / l) * 0.09, hy = dY[i] + (dy / l) * 0.09;
          const hl = Math.hypot(hx, hy) || 1; dX[i] = hx / hl; dY[i] = hy / hl;
          if (l < 40 && cd[i] <= 0) {
            curAtk = t;
            for (let k = 0; k < 3; k++) fireArc(P.BOMB, x[i], y[i], x[i] + dX[i] * (40 + k * 22), y[i] + dY[i] * (40 + k * 22), team[i], UDMG[t], UAOE[t], 0, UALT[t]);
            cd[i] = UCD[t]; state[i] = 1; aux2[i] = 1.3;
          }
        }
        mvx = dX[i]; mvy = dY[i];
        return;
      }
      case B.RAM: {
        if (tg >= 0) {
          const d = edgeDist(i, tg);
          if (d <= UREACH[t] + 2) {
            if (cd[i] <= 0) { melee(i, tg, 1); cd[i] = UCD[t]; G.fx.dust(x[tg] - face[i] * UR[type[tg]], y[tg], 5); }
            mvs = 0; return;
          }
          if (wallC[i] >= 0 && wallAttack(i)) return;
          if (stuck[i] > 0) followFlow(i); else toward(i, tg);
          return;
        }
        if (wallAttack(i)) return;
        followFlow(i);
        return;
      }
    }
  }

  function updateBuilding(i, t, fl) {
    const u = G.UNITS[t];
    // burning
    if (burn[i] > 0) {
      curAtk = -1;
      burn[i] -= DT;
      damage(i, 14 * DT, -1, true);
      if (rnd() < 0.5) G.fx.buildingFire(x[i], y[i], UR[t]);
      if (!alive[i]) return;
    }
    if (fl & F.FLAMMABLE && burn[i] <= 0) {
      const c = tcell(x[i], y[i]);
      if (fireT[c] > 0) burn[i] = 6;
    }
    if (fl & F.NEUTRAL) {
      if (burn[i] > 0 || fireT[tcell(x[i], y[i])] > 0) damage(i, 30 * DT, -1, true);
      return;
    }
    if (fl & F.MINE) {
      if (S.phase === 'battle' && ((S.tick + i) & 3) === 0) {
        const j = hitAt(x[i], y[i], 3, team[i], -1, 0);
        if (j >= 0 && !(UFL[type[j]] & F.BUILD)) kill(i, -1);
      }
      return;
    }
    // spawning
    if (u.spawnIds && S.count < MAXU - 1000) {
      aux[i] -= DT;
      if (aux[i] <= 0) {
        aux[i] = u.every * (0.85 + rnd() * 0.3);
        const st = u.spawnIds[state[i] % u.spawnIds.length];
        state[i]++;
        const tm = team[i];
        let dx = 0, dy = 0;
        if (tm < 4) { const c = cellOf[i]; dx = fdx[tm][c]; dy = fdy[tm][c]; }
        if (dx === 0 && dy === 0) { dx = x[i] < W / 2 ? 1 : -1; }
        const a = Math.atan2(dy, dx) + (rnd() - 0.5) * 1.6;
        const rr = UR[t] + UR[st] + 3;
        const sx = x[i] + Math.cos(a) * rr, sy = y[i] + Math.sin(a) * rr;
        if (!blockedAt(sx, sy)) {
          const n = S.spawn(st, tm, sx, sy);
          if (n >= 0) G.fx.dust(sx, sy, 3);
        }
      }
    }
    // shooting
    if (URNG[t] > 0) {
      let tg = tgt[i];
      if (!validEnemy(i, tg) || ((S.tick + i) & 15) === 0) tg = tgt[i] = findTarget(i, URNG[t], 0);
      if (tg >= 0 && cd[i] <= 0) {
        const d = Math.hypot(x[tg] - x[i], y[tg] - y[i]) - UR[type[tg]];
        if (d <= URNG[t]) {
          shoot(i, tg);
          cd[i] = UCD[t] * (0.8 + rnd() * 0.4);
          if (u.k === 'hq') tgt[i] = -1; // spread fire
        }
      }
    }
  }

  // --------------------------------------------------------------- main tick
  S.step = function () {
    S.tick++; S.time += DT;
    const tick = S.tick;
    // deferred explosions (chain reactions)
    if (S.explQ.length) {
      const q = S.explQ; S.explQ = [];
      for (let k = 0; k < q.length && k < 7 * 400; k += 7) { curAtk = q[k + 6]; explode(q[k], q[k + 1], q[k + 2], q[k + 3], q[k + 4], q[k + 5]); }
      flushDeaths();
    }
    S.buildGrid();
    if (S.bdirty) rebuildBuildings();
    if (S.flowDirty) { rebuildFlowBlock(); S.flowDirty = false; for (let t = 0; t < 4; t++) computeFlow(t); }
    else { const ft = tick % 12; if (ft < 4 && S.teamCount[ft] > 0) computeFlow(ft); }
    if (tick % 10 === 1) stampAuras();

    // ------------------------------------------- units (alternate direction: no first-mover bias)
    const rev = tick & 1;
    for (let ii = 0; ii < hw; ii++) {
      const i = rev ? hw - 1 - ii : ii;
      if (!alive[i]) continue;
      const t = type[i], fl = UFL[t];
      px[i] = x[i]; py[i] = y[i];
      if (flash[i] > 0) flash[i] -= DT;
      if (atk[i] > 0) atk[i] -= DT;
      cd[i] -= DT;
      if (fl & F.STATIC) { updateBuilding(i, t, fl); continue; }
      const c = cellOf[i], tm = team[i];
      const tci = tcell(x[i], y[i]);
      const tt = terr[tci];
      buffed[i] = tm < 4 ? aura[c * 4 + tm] : 0;
      // environment
      if (fl & F.AIR) burn[i] = 0;
      else if (TWATER[tt]) burn[i] = 0;
      else if (fireT[tci] > 0 && !(fl & F.FIREPROOF)) burn[i] = Math.max(burn[i], 2.5);
      if (burn[i] > 0) {
        curAtk = -1;
        burn[i] -= DT;
        damage(i, (fl & F.SIEGE ? 12 : 7) * DT, -1, true);
        if (TFUEL[tt] > 0 && rnd() < 0.04) ignite(tci);
        if (((tick + i) & 3) === 0) G.fx.unitFire(x[i], y[i]);
        if (!alive[i]) continue;
      }
      if (tt === T.SPIKES && !(fl & F.AIR)) { curAtk = -1; damage(i, (fl & F.MOUNTED ? 30 : 16) * DT, -1, false); if (!alive[i]) continue; }
      if (tm < 4 && healm[c * 4 + tm] && hp[i] < UHP[t]) { hp[i] = Math.min(UHP[t], hp[i] + 7 * DT); if (((tick + i) & 63) === 0) G.fx.heal(x[i], y[i] - 8); }

      if (stun[i] > 0) {
        stun[i] -= DT;
        mvx = mvy = 0; mvs = 0;
      } else behave(i, t, fl);
      if (!alive[i]) continue;

      // ------------------------------------------- movement
      if (fl & F.AIR) {
        let ax = x[i] + mvx * USPD[t] * mvs * (buffed[i] ? 1.2 : 1) * DT, ay = y[i] + mvy * USPD[t] * mvs * (buffed[i] ? 1.2 : 1) * DT;
        if (ax < 6 || ax > W - 6) { ax = Math.max(6, Math.min(W - 6, ax)); if (UBEH[t] === B.JET) { dX[i] = -dX[i]; state[i] = 0; } }
        if (ay < 6 || ay > H - 6) { ay = Math.max(6, Math.min(H - 6, ay)); if (UBEH[t] === B.JET) { dY[i] = -dY[i]; state[i] = 0; } }
        if (ax - x[i] > 0.3) face[i] = 1; else if (ax - x[i] < -0.3) face[i] = -1;
        x[i] = ax; y[i] = ay;
        continue;
      }
      let sp = USPD[t] * TSPD[tt] * mvs;
      if (fl & F.MOUNTED && TSPD[tt] < 1) sp *= 0.7;
      if (buffed[i]) sp *= 1.2;
      let vx = mvx * sp + kx[i], vy = mvy * sp + ky[i];
      kx[i] *= 0.82; ky[i] *= 0.82;
      if (Math.abs(kx[i]) < 0.5) kx[i] = 0;
      if (Math.abs(ky[i]) < 0.5) ky[i] = 0;
      if (vx === 0 && vy === 0) { if (stuck[i] > 0) stuck[i] -= DT; continue; }
      const nx = x[i] + vx * DT, ny = y[i] + vy * DT;
      if (!blockedAt(nx, ny)) { x[i] = nx; y[i] = ny; if (stuck[i] > 0) stuck[i] -= DT; }
      else {
        const bc = nx >= 0 && ny >= 0 && nx < W && ny < H ? tcell(nx, ny) : -1;
        if (bc >= 0 && (terr[bc] === T.WALL || terr[bc] === T.PALI)) wallC[i] = bc;
        stuck[i] = 1.2;
        if (!blockedAt(nx, y[i])) x[i] = nx;
        else if (!blockedAt(x[i], ny)) y[i] = ny;
        else {
          // slide along the obstacle (perpendicular)
          const sx = x[i] - vy * DT * 0.7, sy = y[i] + vx * DT * 0.7;
          if (!blockedAt(sx, sy)) { x[i] = sx; y[i] = sy; }
        }
      }
      if (vx > 2) face[i] = 1; else if (vx < -2) face[i] = -1;
      if (tgt[i] >= 0 && atk[i] > 0) face[i] = x[tgt[i]] > x[i] ? 1 : -1;
    }

    flushDeaths();
    if (S.spawnQ.length) { const q = S.spawnQ; S.spawnQ = []; for (let k = 0; k < q.length; k += 4) if (!blockedAt(q[k + 2], q[k + 3])) S.spawn(q[k], q[k + 1], q[k + 2], q[k + 3]); }
    // ------------------------------------------- separation (half-neighbourhood)
    separate();

    // ------------------------------------------- projectiles & fire
    updateProjectiles(DT);
    if (tick % 3 === 0) updateFire(DT * 3);
    flushDeaths();

    // victory
    if (S.phase === 'battle' && S.winner === -2 && tick > 30) {
      let alive2 = 0, last = -1;
      for (let k = 0; k < 4; k++) if (S.teamCount[k] > 0) { alive2++; last = k; }
      if (alive2 <= 1 && S.startTeams >= 2) S.winner = last;
    }
  };

  function separate() {
    const MAXN = 24;
    const n = cellStart[NC];
    const sx = sxA, sy = syA, sr = srA, sm = smA, ax = axA, ay = ayA;
    ax.fill(0, 0, n); ay.fill(0, 0, n);
    // gather in cell order (cache friendly)
    for (let k = 0; k < n; k++) {
      const i = cellItems[k];
      sx[k] = x[i]; sy[k] = y[i];
      const t = type[i];
      if (!alive[i] || (UFL[t] & F.STATIC)) { sm[k] = 0; sr[k] = 0; }
      else { sm[k] = UMASS[t]; sr[k] = UR[t]; if (UFL[t] & F.AIR) sm[k] = -sm[k]; }
    }
    // with very large armies, resolve half of the rows each tick (each pair still every 2 ticks)
    const half = n > 24000;
    const stiff = half ? 0.7 : 0.45;
    const par = S.tick & 1;
    const flip = (S.tick >> 1) & 1; // alternate sweep direction (removes left/right bias)
    for (let cy0 = 0; cy0 < GH; cy0++) {
      const cy = flip ? GH - 1 - cy0 : cy0;
      if (half && (cy & 1) !== par) continue;
      const row = cy * GW;
      for (let cx0 = 0; cx0 < GW; cx0++) {
        const cx = flip ? GW - 1 - cx0 : cx0;
        const c = row + cx;
        const a0 = cellStart[c], a1e = cellStart[c + 1];
        if (a0 === a1e) continue;
        const a1 = a1e - a0 > MAXN ? a0 + MAXN : a1e;
        // neighbour ranges: E, S, SW, SE
        let e0 = 0, e1 = 0, s0 = 0, s1 = 0, w0 = 0, w1 = 0, q0 = 0, q1 = 0;
        if (cx + 1 < GW) { e0 = cellStart[c + 1]; e1 = Math.min(cellStart[c + 2], e0 + MAXN); }
        if (cy + 1 < GH) {
          const sc = c + GW;
          s0 = cellStart[sc]; s1 = Math.min(cellStart[sc + 1], s0 + MAXN);
          if (cx > 0) { w0 = cellStart[sc - 1]; w1 = Math.min(cellStart[sc], w0 + MAXN); }
          if (cx + 1 < GW) { q0 = cellStart[sc + 1]; q1 = Math.min(cellStart[sc + 2], q0 + MAXN); }
        }
        for (let ka = a0; ka < a1; ka++) {
          let mi = sm[ka];
          if (mi === 0) continue;
          const li = mi < 0;
          if (li) mi = -mi;
          const xi = sx[ka], yi = sy[ka];
          let axi = 0, ayi = 0;
          const ri = sr[ka];
          for (let pass = 0; pass < 5; pass++) {
            let b0, b1;
            if (pass === 0) { b0 = ka + 1; b1 = a1; }
            else if (pass === 1) { b0 = e0; b1 = e1; }
            else if (pass === 2) { b0 = s0; b1 = s1; }
            else if (pass === 3) { b0 = w0; b1 = w1; }
            else { b0 = q0; b1 = q1; }
            for (let kb = b0; kb < b1; kb++) {
              let mj = sm[kb];
              if (mj === 0 || (mj < 0) !== li) continue;
              if (mj < 0) mj = -mj;
              const dx = sx[kb] - xi, dy = sy[kb] - yi;
              const rr = ri + sr[kb];
              const d2 = dx * dx + dy * dy;
              if (d2 >= rr * rr) continue;
              if (d2 < 1e-4) { ax[kb] += (rnd() - 0.5) * 0.6; ay[kb] += (rnd() - 0.5) * 0.6; continue; }
              const d = Math.sqrt(d2);
              const push = ((rr - d) * stiff) / d;
              const wi = mj / (mi + mj);
              const pxw = dx * push, pyw = dy * push;
              axi -= pxw * wi; ayi -= pyw * wi;
              ax[kb] += pxw * (1 - wi); ay[kb] += pyw * (1 - wi);
            }
          }
          ax[ka] += axi; ay[ka] += ayi;
        }
      }
    }
    // scatter back
    for (let k = 0; k < n; k++) if (sm[k] !== 0) { const i = cellItems[k]; x[i] = sx[k] + ax[k]; y[i] = sy[k] + ay[k]; }
    // buildings & terrain validation
    for (let i = 0; i < hw; i++) {
      if (!alive[i]) continue;
      const ti = type[i];
      if (UFL[ti] & F.STATIC) continue;
      if (UFL[ti] & F.AIR) { if (x[i] < 2) x[i] = 2; else if (x[i] > W - 2) x[i] = W - 2; if (y[i] < 2) y[i] = 2; else if (y[i] > H - 2) y[i] = H - 2; anim[i] += 1; continue; }
      let cx = (x[i] / GC) | 0, cy = (y[i] / GC) | 0;
      if (cx < 0) cx = 0; else if (cx >= GW) cx = GW - 1;
      if (cy < 0) cy = 0; else if (cy >= GH) cy = GH - 1;
      const b = bgrid[cy * GW + cx];
      if (b >= 0 && alive[b]) {
        const dx = x[i] - x[b], dy = y[i] - y[b];
        const rr = UR[type[b]] + UR[ti] * 0.8;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.01;
          const nx = x[b] + (dx / d) * rr, ny = y[b] + (dy / d) * rr;
          if (!blockedAt(nx, ny)) { x[i] = nx; y[i] = ny; }
          if (tgt[i] < 0 && team[b] !== team[i] && team[b] !== NEUTRAL) tgt[i] = b;
        }
      }
      if (blockedAt(x[i], y[i])) {
        if (!blockedAt(x[i], py[i])) y[i] = py[i];
        else if (!blockedAt(px[i], y[i])) x[i] = px[i];
        else { x[i] = px[i]; y[i] = py[i]; }
      }
      if (x[i] < 2) x[i] = 2; else if (x[i] > W - 2) x[i] = W - 2;
      if (y[i] < 2) y[i] = 2; else if (y[i] > H - 2) y[i] = H - 2;
      const ddx = x[i] - px[i], ddy = y[i] - py[i];
      anim[i] += Math.sqrt(ddx * ddx + ddy * ddy) * 0.16;
    }
  }

  // --------------------------------------------------------------- battle control
  S.startBattle = function () {
    S.phase = 'battle';
    const NU = G.UNITS.length;
    S.stat = { deployed: new Int32Array(NU * 4), lost: new Int32Array(NU * 4), kills: new Int32Array(NU * 4) };
    for (let i = 0; i < hw; i++) if (alive[i] && team[i] < 4) S.stat.deployed[type[i] * 4 + team[i]]++;
    S.buildGrid();
    let n = 0;
    for (let k = 0; k < 4; k++) if (S.teamCount[k] > 0) n++;
    S.startTeams = n;
    S.winner = -2;
    S.flowDirty = true;
  };

  // snapshot for "replay"
  S.snapshot = function () {
    const units = [];
    for (let i = 0; i < hw; i++) if (alive[i]) units.push(type[i], team[i], x[i], y[i]);
    return { units: new Float32Array(units), terr: terr.slice(), thp: thp.slice(), W, H, stance: S.stance.slice() };
  };
  S.restore = function (snap) {
    if (snap.W !== W || snap.H !== H) G.initWorld(snap.W, snap.H);
    S.clearAll();
    terr.set(snap.terr); thp.set(snap.thp);
    if (snap.stance) S.stance = snap.stance.slice();
    const u = snap.units;
    for (let k = 0; k < u.length; k += 4) S.spawn(u[k], u[k + 1], u[k + 2], u[k + 3]);
    S.terrDirty = true; S.flowDirty = true; S.objDirty = true;
    S.buildGrid();
  };

  // --------------------------------------------------------------- painting
  S.paintTerrain = function (wx, wy, rad, tt) {
    const x0 = Math.max(0, ((wx - rad) / TC) | 0), x1 = Math.min(TW - 1, ((wx + rad) / TC) | 0);
    const y0 = Math.max(0, ((wy - rad) / TC) | 0), y1 = Math.min(TH - 1, ((wy + rad) / TC) | 0);
    let changed = false;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const dx = tx * TC + 4 - wx, dy = ty * TC + 4 - wy;
      if (dx * dx + dy * dy > rad * rad) continue;
      const c = ty * TW + tx;
      if (terr[c] === tt) continue;
      terr[c] = tt; thp[c] = THP[tt]; fireT[c] = 0; tvar[c] &= ~1;
      changed = true;
    }
    if (changed) { S.terrDirty = true; S.flowDirty = true; S.objDirty = true; }
    if (changed && TBLK[tt]) {
      // push out units now inside solid cells
      for (let i = 0; i < hw; i++) {
        if (!alive[i]) continue;
        if (TBLK[terr[tcell(x[i], y[i])]]) {
          if (UFL[type[i]] & F.STATIC) { S.remove(i); continue; }
          if (Math.hypot(x[i] - wx, y[i] - wy) < rad + 10) S.remove(i);
        }
      }
    }
  };
  S.igniteAt = function (wx, wy, rad) {
    const x0 = Math.max(0, ((wx - rad) / TC) | 0), x1 = Math.min(TW - 1, ((wx + rad) / TC) | 0);
    const y0 = Math.max(0, ((wy - rad) / TC) | 0), y1 = Math.min(TH - 1, ((wy + rad) / TC) | 0);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (rnd() < 0.3) ignite(ty * TW + tx);
    for (let i = 0; i < hw; i++) if (alive[i] && Math.hypot(x[i] - wx, y[i] - wy) < rad) burn[i] = Math.max(burn[i], 3);
  };
  S.eraseAt = function (wx, wy, rad) {
    for (let i = 0; i < hw; i++) {
      if (!alive[i]) continue;
      const dx = x[i] - wx, dy = y[i] - wy, r = rad + UR[type[i]];
      if (dx * dx + dy * dy < r * r) S.remove(i);
    }
  };
  S.unitsIn = function (wx, wy, rad, cb) {
    for (let i = 0; i < hw; i++) {
      if (!alive[i]) continue;
      const dx = x[i] - wx, dy = y[i] - wy, r = rad + UR[type[i]];
      if (dx * dx + dy * dy < r * r) cb(i);
    }
  };
  S.getFireN = () => fireN;
  S.getAura = () => aura;
})();
