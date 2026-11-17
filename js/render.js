'use strict';
// ============================================================================
//  WebGL2 renderer: instanced sprites + procedural ground + decal FBO.
//  Also hosts the particle / decal system (G.fx).
// ============================================================================
(function () {
  const F = G.F, T = G.T, P = G.P;
  const R = (G.R = {});
  let gl, canvas;
  let progSprite, progGround;
  let quadBuf, instBuf, vao;
  let texBase, texMask, texFrames, texTerr, texDecal, fboDecal;
  let decalW = 0, decalH = 0, decalScale = 1;
  let terrPixels = null;

  const MAXI = 420000;
  const stageBuf = new ArrayBuffer(MAXI * 32);
  const stF = new Float32Array(stageBuf), stU = new Uint32Array(stageBuf);
  const outBuf = new ArrayBuffer(MAXI * 32);
  const outF = new Float32Array(outBuf), outU = new Uint32Array(outBuf);
  const keys = new Uint16Array(MAXI);
  const NKEY = 4096;
  const keyCount = new Int32Array(NKEY + 1);
  let ni = 0;

  G.cam = { x: 0, y: 0, zoom: 1 };
  R.stats = { instances: 0 };

  // -------------------------------------------------------------- shaders
  const VS_SPRITE = `#version 300 es
  layout(location=0) in vec2 aCorner;
  layout(location=1) in vec4 aPosSize;
  layout(location=2) in vec2 aRotFrame;
  layout(location=3) in vec4 aColor;
  layout(location=4) in vec4 aMisc;
  uniform vec2 uCam; uniform float uZoom; uniform vec2 uView;
  uniform highp sampler2D uFrames;
  out vec2 vUV; out vec4 vColor; out vec4 vMisc;
  void main(){
    int f = int(aRotFrame.y + 0.5);
    vec4 r = texelFetch(uFrames, ivec2(f, 0), 0);
    vec4 pv = texelFetch(uFrames, ivec2(f, 1), 0);
    vUV = mix(r.xy, r.zw, aCorner);
    vec2 lp = (aCorner - pv.xy) * aPosSize.zw;
    float s = sin(aRotFrame.x), c = cos(aRotFrame.x);
    lp = vec2(lp.x * c - lp.y * s, lp.x * s + lp.y * c);
    vec2 sp = (aPosSize.xy + lp - uCam) * uZoom;
    gl_Position = vec4(sp.x / uView.x * 2.0 - 1.0, 1.0 - sp.y / uView.y * 2.0, 0.0, 1.0);
    vColor = aColor; vMisc = aMisc;
  }`;
  const FS_SPRITE = `#version 300 es
  precision mediump float;
  uniform sampler2D uBase; uniform sampler2D uMask;
  in vec2 vUV; in vec4 vColor; in vec4 vMisc;
  out vec4 o;
  void main(){
    vec4 b = texture(uBase, vUV);
    float a = b.a;
    if (a < 0.004) discard;
    vec3 st = b.rgb / a;
    vec3 c;
    float mode = vMisc.z * 255.0;
    if (mode < 0.5) {
      float m = texture(uMask, vUV).r;
      c = mix(st, min(vColor.rgb * st.r * 2.0, vec3(1.0)), m);
    } else {
      c = st * vColor.rgb;
      a *= vColor.a;
    }
    c = mix(c, vec3(1.0), vMisc.x);
    c *= 1.0 - vMisc.y;
    a *= vMisc.w;
    // mode 2 = additive (premultiplied with zero alpha)
    o = mode > 1.5 ? vec4(c * a, 0.0) : vec4(c * a, a);
  }`;
  const VS_GROUND = `#version 300 es
  uniform vec2 uCam; uniform float uZoom; uniform vec2 uView;
  out vec2 vW;
  void main(){
    vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
    vec2 px = vec2((p.x + 1.0) * 0.5 * uView.x, (1.0 - p.y) * 0.5 * uView.y);
    vW = uCam + px / uZoom;
    gl_Position = vec4(p, 0.0, 1.0);
  }`;
  const FS_GROUND = `#version 300 es
  precision highp float;
  uniform sampler2D uTerr; uniform sampler2D uDecal;
  uniform vec2 uWorld; uniform float uTime; uniform float uMid; uniform float uZoom;
  in vec2 vW; out vec4 o;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  void main(){
    vec2 w = vW;
    if (w.x < 0.0 || w.y < 0.0 || w.x > uWorld.x || w.y > uWorld.y) {
      float e = max(max(-w.x, w.x - uWorld.x), max(-w.y, w.y - uWorld.y));
      o = vec4(mix(vec3(0.19,0.24,0.16), vec3(0.11,0.13,0.10), clamp(e/60.0,0.0,1.0)), 1.0); return;
    }
    vec2 uv = w / uWorld;
    // organic, crisp terrain borders: warp the lookup with noise, then sharpen the bilinear blend
    vec2 ts = vec2(textureSize(uTerr, 0));
    vec2 warp = vec2(vn(w * 0.11), vn(w * 0.11 + 17.3)) - 0.5;
    vec2 p = w / uWorld * ts - 0.5 + warp * 1.1;
    vec2 fp = fract(p);
    fp = smoothstep(0.32, 0.68, fp);
    vec4 t = texture(uTerr, (floor(p) + fp + 0.5) / ts);
    vec3 c = t.rgb;
    float n = vn(w * 0.035) * 0.55 + vn(w * 0.16) * 0.3 + h21(floor(w * 0.9)) * 0.15;
    c *= 0.88 + n * 0.24;
    float wa = t.a;
    if (wa > 0.01) {
      float r1 = sin(w.x * 0.08 + uTime * 1.5 + sin(w.y * 0.045 + uTime * 0.7) * 2.5) * 0.5 + 0.5;
      float r2 = sin(w.y * 0.12 - uTime * 1.1 + w.x * 0.03) * 0.5 + 0.5;
      c = mix(c, c * 0.92 + vec3(0.03,0.05,0.08), wa);
      c += wa * pow(r1 * r2, 4.0) * 0.35;
    }
    vec4 d = texture(uDecal, vec2(uv.x, 1.0 - uv.y));
    c = c * (1.0 - d.a) + d.rgb;
    // border vignette
    vec2 e = min(w, uWorld - w);
    c *= 0.82 + 0.18 * clamp(min(e.x, e.y) / 40.0, 0.0, 1.0);
    if (uMid > 0.0) {
      float dm = abs(w.x - uWorld.x * 0.5) * uZoom;
      float dash = step(mod(w.y, 26.0), 15.0);
      c = mix(c, vec3(1.0), uMid * dash * (1.0 - smoothstep(0.8, 2.0, dm)) * 0.7);
    }
    o = vec4(c, 1.0);
  }`;

  function compile(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  R.init = function (cv) {
    canvas = cv;
    gl = cv.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 non supporté par ce navigateur.');
    progSprite = compile(VS_SPRITE, FS_SPRITE);
    progGround = compile(VS_GROUND, FS_GROUND);

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, outBuf.byteLength, gl.DYNAMIC_DRAW);
    for (let l = 1; l <= 4; l++) { gl.enableVertexAttribArray(l); gl.vertexAttribDivisor(l, 1); }
    bindInst(0);

    // atlas
    texBase = makeTex(gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, G.atlasBase);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    texMask = makeTex(gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, G.atlasMask);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

    // frame table
    const fr = G.frames, nf = fr.length;
    const fd = new Float32Array(nf * 4 * 2);
    for (let i = 0; i < nf; i++) {
      const f = fr[i];
      fd[i * 4] = f.x / G.ATLAS_W; fd[i * 4 + 1] = f.y / G.ATLAS_H;
      fd[i * 4 + 2] = (f.x + f.w) / G.ATLAS_W; fd[i * 4 + 3] = (f.y + f.h) / G.ATLAS_H;
      fd[(nf + i) * 4] = f.px; fd[(nf + i) * 4 + 1] = f.py;
    }
    texFrames = makeTex(gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, nf, 2, 0, gl.RGBA, gl.FLOAT, fd);
    R.fw = new Float32Array(nf); R.fh = new Float32Array(nf);
    for (let i = 0; i < nf; i++) { R.fw[i] = fr[i].ww; R.fh[i] = fr[i].wh; }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    R.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  };

  function bindInst(first) {
    const o = first * 32;
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, o);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, o + 16);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 32, o + 24);
    gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, 32, o + 28);
  }

  function makeTex(filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // called whenever world size changes
  R.initWorld = function () {
    const S = G.S;
    if (texTerr) gl.deleteTexture(texTerr);
    texTerr = makeTex(gl.LINEAR);
    terrPixels = new Uint8Array(S.TW * S.TH * 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S.TW, S.TH, 0, gl.RGBA, gl.UNSIGNED_BYTE, terrPixels);
    if (texDecal) { gl.deleteTexture(texDecal); gl.deleteFramebuffer(fboDecal); }
    decalScale = Math.min(1.5, (R.maxTex || 4096) / Math.max(S.W, S.H));
    decalW = Math.round(S.W * decalScale); decalH = Math.round(S.H * decalScale);
    texDecal = makeTex(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, decalW, decalH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    fboDecal = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboDecal);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texDecal, 0);
    R.clearDecals();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    S.terrDirty = true; S.objDirty = true;
  };
  R.clearDecals = function () {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboDecal);
    gl.viewport(0, 0, decalW, decalH);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    decalQ.length = 0;
  };

  // -------------------------------------------------------------- terrain texture & objects
  const objX = [], objY = [], objF = [], objC = [];
  let nObj = 0;
  function uploadTerrain() {
    const S = G.S, terr = S.terr, fire = S.fireT, tvar = S.tvar;
    const TER = G.TERRAIN;
    const px = terrPixels;
    for (let c = 0, n = terr.length; c < n; c++) {
      const tt = terr[c];
      const col = TER[tt].col;
      const v = ((tvar[c] >> 2) - 32) / 32 * (tt === T.GRASS ? 0.018 : 0.05) + 1;
      let r = col[0] * v, g = col[1] * v, b = col[2] * v;
      if (fire[c] > 0) { r = r * 0.4 + 200; g = g * 0.4 + 70; b = b * 0.3 + 10; }
      const o = c * 4;
      px[o] = r > 255 ? 255 : r; px[o + 1] = g > 255 ? 255 : g; px[o + 2] = b;
      px[o + 3] = TER[tt].water ? 255 : 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, texTerr);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, S.TW, S.TH, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  function rebuildObjects() {
    const S = G.S, terr = S.terr, tvar = S.tvar, fire = S.fireT, TW = S.TW, TC = G.TC;
    const FR = G.FR;
    nObj = 0;
    const white = 0xffffffff;
    for (let c = 0, n = terr.length; c < n; c++) {
      const tt = terr[c];
      if (tt === T.GRASS || tt === T.WATER || tt === T.DEEP || tt === T.MUD || tt === T.SAND || tt === T.ROAD || tt === T.TALL || tt === T.RUBBLE) continue;
      const cx = (c % TW) * TC + 4, cy = ((c / TW) | 0) * TC + 4;
      const v = tvar[c];
      let f = -1, ox = 0, oy = 0, col = white;
      switch (tt) {
        case T.FOREST: f = (v & 12) === 12 ? FR.pine : FR['tree' + ((v >> 4) % 3)]; ox = ((v >> 3) & 3) - 1.5; oy = ((v >> 5) & 3) - 1.5; if (fire[c] > 0) col = 0xff3070ff; break;
        case T.ROCK: if ((v & 4) === 0 || (v & 16)) { f = FR['rock' + ((v >> 3) & 1)]; ox = ((v >> 5) & 3) - 1.5; } break;
        case T.WALL: f = v & 1 ? FR.wallcr : FR.wall; break;
        case T.PALI: f = FR.pali; if (fire[c] > 0) col = 0xff3060ff; break;
        case T.SPIKES: if (v & 2 || (v & 8)) { f = FR.spikes; ox = ((v >> 4) & 3) - 1.5; oy = ((v >> 6) & 3) - 1.5; } break;
        case T.BURNT: if ((v & 2) && ((v >> 4) & 3) === 0) { f = FR.treeburnt; ox = ((v >> 3) & 3) - 1.5; } break;
      }
      if (f < 0) continue;
      objX[nObj] = cx + ox; objY[nObj] = cy + oy; objF[nObj] = f; objC[nObj] = col;
      nObj++;
    }
  }

  // -------------------------------------------------------------- instance writer
  function put(xw, yw, w, h, rot, frame, col, misc, key) {
    if (ni >= MAXI) return;
    const o = ni * 8;
    stF[o] = xw; stF[o + 1] = yw; stF[o + 2] = w; stF[o + 3] = h;
    stF[o + 4] = rot; stF[o + 5] = frame;
    stU[o + 6] = col; stU[o + 7] = misc;
    keys[ni] = key < 0 ? 0 : key > NKEY - 1 ? NKEY - 1 : key;
    ni++;
  }
  const MISC_TEAM = (255 << 24) >>> 0;              // flash 0 dark 0 mode 0 alpha 255
  const MISC_MULT = ((255 << 24) | (1 << 16)) >>> 0;
  const MISC_ADD = ((255 << 24) | (2 << 16)) >>> 0;
  function misc(flash, dark, mode, alpha) { return ((flash & 255) | ((dark & 255) << 8) | ((mode & 255) << 16) | ((alpha & 255) << 24)) >>> 0; }
  R.misc = misc;
  function rgba(r, g, b, a) { return ((r & 255) | ((g & 255) << 8) | ((b & 255) << 16) | ((a & 255) << 24)) >>> 0; }
  R.rgba = rgba;
  const TEAMC = G.TEAM_RGB.map((c) => rgba(c[0], c[1], c[2], 255));

  // copy staged instances [from, ni) into out buffer at position `at`, sorted by key if requested
  function flushSorted(from, at) {
    const n = ni - from;
    keyCount.fill(0);
    for (let k = from; k < ni; k++) keyCount[keys[k] + 1]++;
    for (let k = 0; k < NKEY; k++) keyCount[k + 1] += keyCount[k];
    for (let k = from; k < ni; k++) {
      const d = (at + keyCount[keys[k]]++) * 8, s = k * 8;
      outU[d] = stU[s]; outU[d + 1] = stU[s + 1]; outU[d + 2] = stU[s + 2]; outU[d + 3] = stU[s + 3];
      outU[d + 4] = stU[s + 4]; outU[d + 5] = stU[s + 5]; outU[d + 6] = stU[s + 6]; outU[d + 7] = stU[s + 7];
    }
    return n;
  }
  function flushPlain(from, at) {
    const n = ni - from;
    outU.set(stU.subarray(from * 8, ni * 8), at * 8);
    return n;
  }

  // -------------------------------------------------------------- decals (persistent ground layer)
  const decalQ = []; // [frame, x, y, w, h, rot, col, misc]
  function drawDecals() {
    if (!decalQ.length) return;
    ni = 0;
    for (let k = 0; k < decalQ.length; k += 8) put(decalQ[k + 1], decalQ[k + 2], decalQ[k + 3], decalQ[k + 4], decalQ[k + 5], decalQ[k], decalQ[k + 6], decalQ[k + 7], 0);
    decalQ.length = 0;
    const n = flushPlain(0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboDecal);
    gl.viewport(0, 0, decalW, decalH);
    gl.useProgram(progSprite.p);
    setSpriteUniforms(0, 0, decalScale, decalW, decalH);
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, outU, 0, n * 8);
    bindInst(0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function setSpriteUniforms(cx, cy, zoom, vw, vh) {
    const u = progSprite.u;
    gl.uniform2f(u.uCam, cx, cy); gl.uniform1f(u.uZoom, zoom); gl.uniform2f(u.uView, vw, vh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texBase); gl.uniform1i(u.uBase, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texMask); gl.uniform1i(u.uMask, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texFrames); gl.uniform1i(u.uFrames, 2);
  }

  // ==================================================================== particles
  const MAXFX = G.MAXFX;
  const fxX = new Float32Array(MAXFX), fxY = new Float32Array(MAXFX), fxZ = new Float32Array(MAXFX);
  const fxVX = new Float32Array(MAXFX), fxVY = new Float32Array(MAXFX), fxVZ = new Float32Array(MAXFX);
  const fxL = new Float32Array(MAXFX), fxM = new Float32Array(MAXFX);
  const fxS0 = new Float32Array(MAXFX), fxS1 = new Float32Array(MAXFX), fxRot = new Float32Array(MAXFX), fxVR = new Float32Array(MAXFX);
  const fxH = new Float32Array(MAXFX);
  const fxF = new Uint16Array(MAXFX), fxC = new Uint32Array(MAXFX), fxFl = new Uint8Array(MAXFX);
  let nfx = 0;
  // flags: 1 additive, 2 gravity, 4 stretch (s0 = length, h = thickness), 8 fade-in, 16 decal-on-land (blood)
  function P_(f, x, y, z, vx, vy, vz, life, s0, s1, col, fl) {
    if (nfx >= MAXFX) return -1;
    const i = nfx++;
    fxF[i] = f; fxX[i] = x; fxY[i] = y; fxZ[i] = z; fxVX[i] = vx; fxVY[i] = vy; fxVZ[i] = vz;
    fxL[i] = life; fxM[i] = life; fxS0[i] = s0; fxS1[i] = s1; fxC[i] = col; fxFl[i] = fl; fxRot[i] = Math.random() * 6.28; fxVR[i] = 0; fxH[i] = 0;
    return i;
  }
  const rnd = Math.random;
  const fx = (G.fx = {
    budget: 1,
    decal(f, x, y, w, h, rot, col, m) { if (decalQ.length < 8 * 6000) decalQ.push(f, x, y, w, h, rot, col, m == null ? MISC_MULT : m); },
    corpse(j) {
      const S = G.S, t = S.type[j];
      const f = G.unitFrames[t * 3];
      const side = rnd() < 0.5 ? -1 : 1;
      const w = R.fw[f] * S.face[j], h = R.fh[f];
      decalQ.push(f, S.x[j], S.y[j] - 2, w, h, side * (1.35 + rnd() * 0.4), TEAMC[S.team[j]], misc(0, 70, 0, 235));
      if (rnd() < 0.7) decalQ.push(G.FR.splat, S.x[j] + (rnd() - 0.5) * 4, S.y[j], 6 + rnd() * 4, 4 + rnd() * 3, rnd() * 6, 0xffffffff, MISC_MULT);
    },
    blood(x, y, n) {
      if (nfx > MAXFX * 0.8) return;
      for (let k = 0; k < n; k++) P_(G.FR.dot, x, y, 6, (rnd() - 0.5) * 40, (rnd() - 0.5) * 20, 20 + rnd() * 40, 0.5 + rnd() * 0.3, 1.2, 0.8, 0xff1010a0, 2 | 16);
    },
    spark(x, y, n) {
      for (let k = 0; k < n; k++) P_(G.FR.spark, x, y, 4, (rnd() - 0.5) * 90, (rnd() - 0.5) * 50, 20 + rnd() * 50, 0.25 + rnd() * 0.2, 1.8, 0.5, 0xff80e0ff, 1 | 2);
    },
    dust(x, y, n) {
      if (nfx > MAXFX * 0.7) return;
      for (let k = 0; k < n; k++) P_(G.FR.smoke, x + (rnd() - 0.5) * 8, y + (rnd() - 0.5) * 4, 1, (rnd() - 0.5) * 25, (rnd() - 0.5) * 10, 6 + rnd() * 8, 0.8 + rnd() * 0.6, 4, 9, 0x70a0c0d0, 0);
    },
    smokePuff(x, y, n) {
      for (let k = 0; k < n; k++) P_(G.FR.smoke, x + (rnd() - 0.5) * 6, y - 4 + (rnd() - 0.5) * 6, 2, (rnd() - 0.5) * 30, (rnd() - 0.5) * 20, 10 + rnd() * 10, 0.6 + rnd() * 0.4, 6, 12, 0xc0303030, 0);
    },
    heal(x, y) { P_(G.FR.heal, x + (rnd() - 0.5) * 6, y, 2, 0, 0, 18, 0.8, 3, 3, 0xffffffff, 0); },
    tracer(x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
      const i = P_(G.FR.tracer, (x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, 0, 0.08, l, 1.2, 0xb0ffffff, 1 | 4);
      if (i >= 0) fxRot[i] = Math.atan2(dy, dx);
    },
    muzzle(x, y, face, s = 1) {
      P_(G.FR.flash, x, y, 0, 0, 0, 0, 0.08, 6 * s, 8 * s, 0xff60d0ff, 1);
      if (nfx < MAXFX * 0.8) for (let k = 0; k < 3 * s; k++) P_(G.FR.smoke, x + face * 2, y, 0, face * (10 + rnd() * 20), (rnd() - 0.5) * 10, 4 + rnd() * 6, 1.2 + rnd() * 0.8, 4 * s, 12 * s, 0x90e8e8e8, 0);
    },
    explosion(x, y, R, fire) {
      P_(G.FR.flash, x, y, 2, 0, 0, 0, 0.22, R * 1.6, R * 2.6, 0xff50c0ff, 1);
      P_(G.FR.ring, x, y, 0, 0, 0, 0, 0.25, R * 0.6, R * 2.2, 0x5080d0ff, 1);
      const dense = nfx < MAXFX * 0.6;
      const n = dense ? Math.min(14, 4 + R / 5) : 2;
      for (let k = 0; k < n; k++) {
        const a = rnd() * 6.28, s = rnd() * R * 0.6;
        if (k < n * 0.6) P_(G.FR.smoke, x + Math.cos(a) * s, y + Math.sin(a) * s * 0.6, 2, Math.cos(a) * 20, Math.sin(a) * 12, 14 + rnd() * 18, 0.7 + rnd() * 0.8, R * 0.3, R * 0.75, fire ? 0x70485868 : 0x70788088, 0);
        P_(G.FR.flame, x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.4, 3, Math.cos(a) * 30, Math.sin(a) * 18, 20 + rnd() * 20, 0.25 + rnd() * 0.25, R * 0.3, R * 0.6, 0xff2080ff, 1);
      }
      if (dense) for (let k = 0; k < n; k++) P_(G.FR.chip, x, y, 3, (rnd() - 0.5) * R * 6, (rnd() - 0.5) * R * 3, 40 + rnd() * 70, 0.6 + rnd() * 0.4, 1.4, 1.4, 0xff304050, 2);
      fx.decal(G.FR.scorch, x, y, R * 1.8, R * 1.3, rnd() * 6, 0xffffffff);
      G.shake = Math.min(8, (G.shake || 0) + R * 0.04);
    },
    debris(x, y, col, n = 5) {
      for (let k = 0; k < n; k++) P_(G.FR.chip, x, y, 4, (rnd() - 0.5) * 60, (rnd() - 0.5) * 30, 30 + rnd() * 50, 0.5 + rnd() * 0.4, 1.6, 1.6, col, 2);
      P_(G.FR.smoke, x, y, 3, 0, 0, 10, 0.8, 5, 10, 0x80a0b0c0, 0);
    },
    burst(x, y, r, n) {
      for (let k = 0; k < n; k++) {
        const a = rnd() * 6.28, s = rnd() * r;
        P_(G.FR.smoke, x + Math.cos(a) * s, y + Math.sin(a) * s * 0.6, 4, Math.cos(a) * 15, Math.sin(a) * 8, 10 + rnd() * 20, 1.4 + rnd(), r * 0.3, r * 0.8, 0xa0707880, 0);
        P_(G.FR.chip, x + Math.cos(a) * s, y, r * 0.5, (rnd() - 0.5) * 80, (rnd() - 0.5) * 30, 40 + rnd() * 60, 0.8, 2, 2, 0xff5a6a7a, 2);
      }
    },
    fireCell(x, y, tt) {
      if (nfx > MAXFX * 0.75) return;
      const big = tt === T.FOREST || tt === T.PALI;
      P_(G.FR.flame, x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6, big ? 6 : 2, (rnd() - 0.5) * 6, 0, 14 + rnd() * 16, 0.4 + rnd() * 0.4, big ? 6 : 4, 1.5, 0xff2a8cff, 1);
      if (rnd() < 0.25) P_(G.FR.smoke, x, y, big ? 12 : 5, (rnd() - 0.5) * 6 + G.S.wind * 20, 0, 14 + rnd() * 10, 1.6 + rnd(), 4, 14, 0x60404040, 0);
    },
    unitFire(x, y) {
      if (nfx > MAXFX * 0.8) return;
      P_(G.FR.flame, x + (rnd() - 0.5) * 4, y, 4 + rnd() * 6, (rnd() - 0.5) * 6, 0, 16 + rnd() * 12, 0.35 + rnd() * 0.2, 4, 1, 0xff2a8cff, 1);
    },
    buildingFire(x, y, r) {
      if (nfx > MAXFX * 0.8) return;
      const ox = (rnd() - 0.5) * r * 1.6;
      P_(G.FR.flame, x + ox, y, r * (0.4 + rnd() * 0.8), (rnd() - 0.5) * 6, 0, 18 + rnd() * 14, 0.5 + rnd() * 0.3, r * 0.35, r * 0.1, 0xff2a8cff, 1);
      if (rnd() < 0.3) P_(G.FR.smoke, x + ox, y, r, (rnd() - 0.5) * 6, 0, 20, 2, r * 0.3, r * 1.1, 0x70303030, 0);
    },
  });

  function updateFx(dt) {
    let n = nfx;
    for (let i = 0; i < n; i++) {
      fxL[i] -= dt;
      if (fxL[i] <= 0) {
        if (fxFl[i] & 16 && fxZ[i] <= 0.5) fx.decal(G.FR.dot, fxX[i], fxY[i], 1.3, 0.9, 0, 0xc01010a0);
        n--;
        fxX[i] = fxX[n]; fxY[i] = fxY[n]; fxZ[i] = fxZ[n]; fxVX[i] = fxVX[n]; fxVY[i] = fxVY[n]; fxVZ[i] = fxVZ[n];
        fxL[i] = fxL[n]; fxM[i] = fxM[n]; fxS0[i] = fxS0[n]; fxS1[i] = fxS1[n]; fxC[i] = fxC[n]; fxFl[i] = fxFl[n];
        fxF[i] = fxF[n]; fxRot[i] = fxRot[n]; fxVR[i] = fxVR[n]; fxH[i] = fxH[n];
        i--;
        continue;
      }
      fxX[i] += fxVX[i] * dt; fxY[i] += fxVY[i] * dt; fxZ[i] += fxVZ[i] * dt;
      if (fxFl[i] & 2) {
        fxVZ[i] -= 220 * dt;
        if (fxZ[i] < 0) { fxZ[i] = 0; fxVZ[i] *= -0.3; fxVX[i] *= 0.5; fxVY[i] *= 0.5; }
      } else { fxVX[i] *= 0.96; fxVY[i] *= 0.96; }
    }
    nfx = n;
  }

  // ==================================================================== frame
  R.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    R.dpr = dpr;
  };

  R.draw = function (alpha, realDt, simDt) {
    const S = G.S;
    R.resize();
    if (S.terrDirty) { uploadTerrain(); S.terrDirty = false; S.objDirty = true; }
    if (S.objDirty) { rebuildObjects(); S.objDirty = false; }
    updateFx(simDt);
    drawDecals();

    const cam = G.cam, dpr = R.dpr;
    const vw = canvas.width, vh = canvas.height;
    const zoom = cam.zoom * dpr;
    let cx = cam.x, cy = cam.y;
    if (G.shake > 0.05) { cx += (rnd() - 0.5) * G.shake / cam.zoom; cy += (rnd() - 0.5) * G.shake / cam.zoom; G.shake *= 0.88; }
    const vx0 = cx - 40, vy0 = cy - 60, vx1 = cx + vw / zoom + 40, vy1 = cy + vh / zoom + 80;

    // ---------------- ground
    gl.viewport(0, 0, vw, vh);
    gl.useProgram(progGround.p);
    const ug = progGround.u;
    gl.uniform2f(ug.uCam, cx, cy); gl.uniform1f(ug.uZoom, zoom); gl.uniform2f(ug.uView, vw, vh);
    gl.uniform2f(ug.uWorld, S.W, S.H); gl.uniform1f(ug.uTime, performance.now() / 1000);
    gl.uniform1f(ug.uMid, S.phase === 'deploy' && G.ui && G.ui.showMid() ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texTerr); gl.uniform1i(ug.uTerr, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texDecal); gl.uniform1i(ug.uDecal, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---------------- build instances
    ni = 0;
    let at = 0;
    const passes = [];
    const fw = R.fw, fh = R.fh;
    const FR = G.FR;
    // pass A: projectile shadows (ground level)
    const pr = S.proj;
    let start = ni;
    for (let p = 0, phw = pr.alive.length; p < phw; p++) {
      if (!pr.alive[p]) continue;
      const k = pr.kind[p];
      if (k === P.FLAME || k === P.FIREBALL) continue;
      const x = pr.px[p] + (pr.x[p] - pr.px[p]) * alpha, y = pr.py[p] + (pr.y[p] - pr.py[p]) * alpha;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const big = k === P.STONE || k === P.CANNON || k === P.BBOLT;
      put(x, y, big ? 5 : 3, big ? 2 : 1.2, 0, FR.shadow, 0xffffffff, MISC_MULT, 0);
    }
    passes.push([at, flushPlain(start, at)]); at += ni - start;

    // pass B: y-sorted world (objects, units, buildings, projectiles)
    start = ni;
    for (let k = 0; k < nObj; k++) {
      const x = objX[k], y = objY[k];
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const f = objF[k];
      put(x, y, fw[f], fh[f], 0, f, objC[k], objC[k] === 0xffffffff ? MISC_MULT : MISC_MULT, (y + 64) | 0);
    }
    const ux = S.x, uy = S.y, upx = S.px, upy = S.py, ut = S.type, utm = S.team, ual = S.alive, uface = S.face, uatk = S.atk, ufl = S.flash, uan = S.anim, uhp = S.hp;
    const UF = G.unitFrames, UFL = G.UFL, UHP = G.UHP, UR = G.UR;
    const hwu = S.hw;
    const lod = zoom < 0.55; // far away: skip walk anim details
    for (let i = 0; i < hwu; i++) {
      if (!ual[i]) continue;
      const x = upx[i] + (ux[i] - upx[i]) * alpha;
      if (x < vx0 || x > vx1) continue;
      const y = upy[i] + (uy[i] - upy[i]) * alpha;
      if (y < vy0 || y > vy1) continue;
      const t = ut[i];
      const fl = UFL[t];
      let f, bob = 0;
      if (fl & F.BUILD) f = UF[t * 3];
      else if (uatk[i] > 0) f = UF[t * 3 + 2];
      else {
        const moving = ux[i] !== upx[i] || uy[i] !== upy[i];
        const ph = uan[i];
        f = UF[t * 3 + (moving ? ((ph | 0) & 1) : 0)];
        if (moving && !lod) bob = Math.abs(Math.sin(ph * 3.14159)) * 0.7;
      }
      let dark = 0;
      if (fl & F.BUILD) dark = ((1 - uhp[i] / UHP[t]) * 90) | 0;
      const fla = ufl[i] > 0 ? 170 : 0;
      put(x, y - bob, fw[f] * (fl & F.BUILD ? 1 : uface[i]), fh[f], 0, f, TEAMC[utm[i]], misc(fla, dark, 0, 255), (y + 64) | 0);
    }
    for (let p = 0, phw = pr.alive.length; p < phw; p++) {
      if (!pr.alive[p]) continue;
      const k = pr.kind[p];
      const x = pr.px[p] + (pr.x[p] - pr.px[p]) * alpha, y = pr.py[p] + (pr.y[p] - pr.py[p]) * alpha;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const z = pr.pz[p] + (pr.z[p] - pr.pz[p]) * alpha;
      let rot, f, w, h, col = 0xffffffff, m = MISC_MULT;
      if (k === P.ARROW || k === P.JAVELIN || k === P.GRENADE || k === P.STONE) {
        const T0 = pr.T[p], tt = Math.min(1, pr.t[p] / T0);
        const ddx = (pr.tx[p] - pr.sx[p]) / T0, ddy = (pr.ty[p] - pr.sy[p]) / T0;
        const dz = pr.h[p] * 4 * (1 - 2 * tt) / T0 - 6 / T0;
        rot = Math.atan2(ddy - dz, ddx);
        f = k === P.ARROW ? FR.arrow : k === P.JAVELIN ? FR.javelin : k === P.GRENADE ? FR.grenade : FR.stone;
        if (k === P.GRENADE || k === P.STONE) rot = pr.t[p] * 8;
      } else {
        rot = Math.atan2(pr.vy[p], pr.vx[p]);
        switch (k) {
          case P.BOLT: f = FR.bolt; break;
          case P.BBOLT: f = FR.bbolt; col = TEAMC[pr.team[p]]; m = MISC_TEAM; break;
          case P.CANNON: f = FR.ball; break;
          case P.SHURIKEN: f = FR.shuriken; rot = pr.t[p] * 25; break;
          case P.FIREBALL: f = FR.fireball; m = MISC_ADD; col = 0xff40b0ff; break;
          case P.FLAME: {
            f = FR.flame; m = MISC_ADD;
            const tt = pr.t[p] / pr.T[p];
            const s = 3 + tt * 9;
            const a = (255 * (1 - tt * 0.8)) | 0;
            col = rgba(255, (200 - tt * 140) | 0, (90 - tt * 80) | 0, a);
            put(x, y - z, s, s, 0, f, col, m, (y + 64) | 0);
            continue;
          }
          default: f = FR.spark;
        }
      }
      w = fw[f]; h = fh[f];
      put(x, y - z, w, h, rot, f, col, m, (y + 64) | 0);
    }
    passes.push([at, flushSorted(start, at)]); at += ni - start;

    // pass C: particles
    start = ni;
    for (let i = 0; i < nfx; i++) {
      const x = fxX[i], y = fxY[i];
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const life = fxL[i] / fxM[i];
      const fl = fxFl[i];
      const f = fxF[i];
      const c = fxC[i];
      const a = ((c >>> 24) * (fl & 1 ? life : Math.min(1, life * 2.2))) | 0;
      const col = ((c & 0xffffff) | (a << 24)) >>> 0;
      if (fl & 4) { put(x, y - fxZ[i], fxS0[i], fxS1[i], fxRot[i], f, col, MISC_ADD, 0); continue; }
      const s = fxS1[i] + (fxS0[i] - fxS1[i]) * life;
      put(x, y - fxZ[i], s, s, fxRot[i], f, col, fl & 1 ? MISC_ADD : MISC_MULT, 0);
    }
    passes.push([at, flushPlain(start, at)]); at += ni - start;

    // pass D: health bars
    start = ni;
    if (zoom > 0.35) {
      const showUnits = G.ui && G.ui.opts.bars;
      const barsH = 1.1;
      for (let i = 0; i < hwu; i++) {
        if (!ual[i]) continue;
        const t = ut[i], fl = UFL[t];
        if (!(fl & F.BUILD) && !showUnits) continue;
        const f = uhp[i] / UHP[t];
        if (f >= 0.999 || fl & F.NEUTRAL) continue;
        const x = upx[i] + (ux[i] - upx[i]) * alpha, y = upy[i] + (uy[i] - upy[i]) * alpha;
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        const r = UR[t];
        const top = fl & F.BUILD ? y - fh[UF[t * 3]] * (G.frames[UF[t * 3]].py) - 3 : y - (r > 5 ? 22 : 16);
        const w = fl & F.BUILD ? r * 1.6 : 9;
        put(x - w / 2 - 0.3, top - 0.3, w + 0.6, barsH + 0.6, 0, FR.white, 0xc0000000, MISC_MULT, 0);
        const g = (f * 255) | 0;
        put(x - w / 2, top, w * f, barsH, 0, FR.white, rgba(255 - g, 60 + g * 0.7, 50, 255), MISC_MULT, 0);
      }
    }
    // brush preview & selection ring
    if (G.ui && G.ui.brushPreview) {
      const b = G.ui.brushPreview;
      put(b.x, b.y, b.r * 2 / 0.875, b.r * 2 / 0.875, 0, FR.ring, b.col, MISC_ADD, 0);
    }
    passes.push([at, flushPlain(start, at)]); at += ni - start;

    R.stats.instances = at;
    // upload & draw
    gl.useProgram(progSprite.p);
    setSpriteUniforms(cx, cy, zoom, vw, vh);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, outU, 0, at * 8);
    for (const [first, n] of passes) {
      if (!n) continue;
      bindInst(first);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    }
  };
  R.nfx = () => nfx;
  R.tickFx = updateFx;
})();
