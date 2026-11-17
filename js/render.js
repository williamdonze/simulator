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
  uniform sampler2D uBase; uniform sampler2D uMask; uniform vec3 uLight;
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
    // mode 3 = emissive glow (not darkened at night, additive)
    if (mode > 2.5) { o = vec4(c * a, 0.0); return; }
    c *= uLight;
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
  uniform vec3 uLight; uniform float uSnow;
  in vec2 vW; out vec4 o;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  vec4 samp(vec2 w) {
    vec2 ts = vec2(textureSize(uTerr, 0));
    // organic, soft transitions between biomes: two octaves of warp + a wide blend
    vec2 warp = (vec2(vn(w * 0.05), vn(w * 0.05 + 17.3)) - 0.5) * 1.3 + (vec2(vn(w * 0.19 + 5.1), vn(w * 0.19 + 41.7)) - 0.5) * 0.5;
    vec2 p = w / uWorld * ts - 0.5 + warp;
    vec2 fp = smoothstep(0.12, 0.88, fract(p));
    return texture(uTerr, (floor(p) + fp + 0.5) / ts);
  }
  void main(){
    vec2 w = vW;
    if (w.x < 0.0 || w.y < 0.0 || w.x > uWorld.x || w.y > uWorld.y) {
      float e = max(max(-w.x, w.x - uWorld.x), max(-w.y, w.y - uWorld.y));
      o = vec4(0.965, 0.965, 0.94, 1.0); return;
    }
    vec2 uv = w / uWorld;
    vec4 t = samp(w);
    vec3 c = t.rgb;
    // cartoon border line between terrain types (type id in alpha)
    float wa = smoothstep(8.6 / 16.0, 10.6 / 16.0, t.a);
    // subtle grass texture
    c *= 0.97 + vn(w * 0.6) * 0.06;
    if (wa > 0.01) {
      float r1 = sin(w.x * 0.07 + uTime * 1.3 + sin(w.y * 0.04 + uTime * 0.6) * 2.5);
      float r2 = sin(w.y * 0.09 - uTime * 0.9 + w.x * 0.02);
      c += wa * smoothstep(0.93, 0.99, r1 * 0.5 + 0.5) * smoothstep(0.2, 0.9, r2 * 0.5 + 0.5) * 0.35;
    }
    // soft shoreline: slightly lighter, shallow water where land meets water
    c = mix(c, c * 1.07 + vec3(0.03, 0.04, 0.02), wa * (1.0 - wa) * 2.4);
    if (uSnow > 0.0) {
      float patchy = smoothstep(0.25, 0.75, vn(w * 0.05) * 0.6 + uSnow * 0.7);
      c = mix(c, vec3(0.96, 0.97, 1.0), (1.0 - wa) * patchy * min(1.0, uSnow * 1.3));
      c = mix(c, vec3(0.82, 0.9, 0.96), wa * smoothstep(0.6, 0.9, uSnow) * 0.85);
    }
    vec4 d = texture(uDecal, vec2(uv.x, 1.0 - uv.y));
    c = c * (1.0 - d.a) + d.rgb;
    if (uMid > 0.0) {
      float dm = abs(w.x - uWorld.x * 0.5) * uZoom;
      float dash = step(mod(w.y, 26.0), 15.0);
      c = mix(c, vec3(0.55, 0.55, 0.6), uMid * dash * (1.0 - smoothstep(0.6, 1.8, dm)) * 0.8);
    }
    o = vec4(c * uLight, 1.0);
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
    const S = G.S, terr = S.terr, fire = S.fireT, tvar = S.tvar, veg = S.veg;
    const TER = G.TERRAIN;
    const px = terrPixels;
    const season = S.season ? S.season() : 0;
    // seasonal tint of living vegetation: spring fresh, summer warm, autumn golden, winter dull
    const st = [[1, 1.02, 0.96], [1.04, 1, 0.9], [1.12, 0.98, 0.8], [0.98, 0.96, 0.98]][season];
    for (let c = 0, n = terr.length; c < n; c++) {
      const tt = terr[c];
      const T0 = TER[tt], v = veg[c];
      const lush = T0.lush, bare = T0.bare;
      let r = bare[0] + (lush[0] - bare[0]) * v, g = bare[1] + (lush[1] - bare[1]) * v, b = bare[2] + (lush[2] - bare[2]) * v;
      if (!T0.water && tt !== T.ROCK && tt !== T.SAND) { r *= st[0]; g *= st[1]; b *= st[2]; }
      if (fire[c] > 0) { r = r * 0.4 + 200; g = g * 0.4 + 70; b = b * 0.3 + 10; }
      const o = c * 4;
      px[o] = r > 255 ? 255 : r; px[o + 1] = g > 255 ? 255 : g; px[o + 2] = b > 255 ? 255 : b;
      px[o + 3] = tt * 16;
    }
    gl.bindTexture(gl.TEXTURE_2D, texTerr);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, S.TW, S.TH, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  const objS = [];
  function rebuildObjects() {
    const S = G.S, terr = S.terr, tvar = S.tvar, fire = S.fireT, veg = S.veg, TW = S.TW, TC = G.TC, tAge = S.tAge;
    const FR = G.FR;
    const season = S.season ? S.season() : 0;
    nObj = 0;
    const white = 0xffffffff;
    for (let c = 0, n = terr.length; c < n; c++) {
      const tt = terr[c];
      const v = tvar[c];
      let f = -1, ox = ((v >> 3) & 3) - 1.5, oy = ((v >> 5) & 3) - 1.5, col = white, sc = 1;
      switch (tt) {
        case T.FOREST: {
          const pine = (v & 0x60) === 0x60;
          if (pine) f = season === 3 ? FR.pineW : FR.pine;
          else if (season === 3) f = FR.treeW;
          else if (season === 2) f = FR['treeA' + ((v >> 4) & 1)];
          else f = FR['tree' + ((v >> 4) % 3)];
          // trees grow: sapling, then a young tree that fills out over ~3 years
          const ag = tAge ? tAge[c] : 3;
          if (ag < 0.5) f = FR.sapling, sc = 0.7 + ag * 0.6;
          else sc = 0.55 + 0.45 * Math.min(1, (ag - 0.5) / 2.5);
          if (fire[c] > 0) col = 0xff3070ff;
          break;
        }
        case T.BUSH: f = season === 3 ? FR.bushW : veg[c] > 0.45 && season > 0 && (!tAge || tAge[c] > 0.6) ? FR.bushB : FR.bush; if (tAge) sc = 0.5 + 0.5 * Math.min(1, tAge[c] / 1.2); break;
        case T.FLOWERS: if (season !== 3 && veg[c] > 0.25 && ((v >> 6) & 3) !== 3) { f = FR['flower' + ((v >> 4) % 5)]; sc = 0.8 + veg[c] * 0.3; } break;
        case T.TALL: if (((v >> 6) & 3) !== 3) { f = season === 3 || veg[c] < 0.3 ? FR.tuftD : FR.tuft; sc = 0.6 + veg[c] * 0.6; } break;
        case T.REEDS: if ((v >> 6) & 1 || (v >> 3) & 1) f = FR.reed; break;
        case T.WATER: if ((v >> 3) === 7 && season < 3) { f = FR.lily; } break;
        case T.ROCK: f = FR['rock' + ((v >> 3) & 1)]; break;
        case T.GRASS: if (v & 4) f = FR.stump; break;
        case T.BURNT: if ((v & 2) && ((v >> 4) & 3) === 0) f = FR.treeburnt; break;
      }
      if (f < 0) continue;
      objX[nObj] = (c % TW) * TC + 4 + ox; objY[nObj] = ((c / TW) | 0) * TC + 4 + oy; objF[nObj] = f; objC[nObj] = col; objS[nObj] = sc;
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
  const MISC_ADD = ((255 << 24) | (1 << 16)) >>> 0; // light cartoon ground: no additive blending
  const MISC_GLOW = ((255 << 24) | (3 << 16)) >>> 0; // emissive (fireflies, sparkles at night)
  function hsl(h) { const k = (n) => (n + h * 12) % 12; const f = (n) => 0.5 - 0.5 * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return rgba(255 * f(0), 255 * f(8), 255 * f(4), 255); }
  // daylight colour from the time of day, plus lightning flashes
  R.light = function (S) {
    const h = S.hour ? S.hour() : 12;
    const day = [1, 1, 1], dusk = [1.0, 0.82, 0.68], night = [0.42, 0.48, 0.74];
    let c;
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    if (h < 4.5 || h > 21.5) c = night;
    else if (h < 6) c = mix(night, dusk, (h - 4.5) / 1.5);
    else if (h < 7.5) c = mix(dusk, day, (h - 6) / 1.5);
    else if (h < 18.5) c = day;
    else if (h < 20) c = mix(day, dusk, (h - 18.5) / 1.5);
    else c = mix(dusk, night, (h - 20) / 1.5);
    if (S.rain > 0.1) c = mix(c, [c[0] * 0.8, c[1] * 0.82, c[2] * 0.9], S.rain);
    if (S.lightning > 0) c = mix(c, [1.6, 1.6, 1.8], Math.min(1, S.lightning));
    R.curLight = c;
    return c;
  };
  function misc(flash, dark, mode, alpha) { return ((flash & 255) | ((dark & 255) << 8) | ((mode & 255) << 16) | ((alpha & 255) << 24)) >>> 0; }
  R.misc = misc;
  function rgba(r, g, b, a) { return ((r & 255) | ((g & 255) << 8) | ((b & 255) << 16) | ((a & 255) << 24)) >>> 0; }
  R.rgba = rgba;


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
    const L = R.curLight || [1, 1, 1];
    gl.uniform3f(u.uLight, L[0], L[1], L[2]);
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
    fxL[i] = life; fxM[i] = life; fxS0[i] = s0; fxS1[i] = s1; fxC[i] = col; fxFl[i] = fl; fxRot[i] = f === G.FR.smoke || f === G.FR.chip ? Math.random() * 6.28 : 0; fxVR[i] = 0; fxH[i] = 0;
    return i;
  }
  const rnd = Math.random;
  const fx = (G.fx = {
    budget: 1,
    decal(f, x, y, w, h, rot, col, m) { if (decalQ.length < 8 * 6000) decalQ.push(f, x, y, w, h, rot, col, m == null ? MISC_MULT : m); },
    corpse(j) {
      // cartoon "poof": the fallen unit vanishes in a puff of white smoke
      const S = G.S, x = S.x[j], y = S.y[j] - 6;
      if (nfx > MAXFX * 0.85) return;
      const n = nfx > MAXFX * 0.5 ? 2 : 4;
      for (let k = 0; k < n; k++) {
        const a = rnd() * 6.28;
        P_(G.FR.smoke, x + Math.cos(a) * 3, y + Math.sin(a) * 2, 0, Math.cos(a) * 14, Math.sin(a) * 8, 8 + rnd() * 8, 0.35 + rnd() * 0.25, 3, 8, 0xf0ffffff, 0);
      }
    },
    blood(x, y, n) {
      if (nfx > MAXFX * 0.8 || rnd() < 0.6) return;
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
      for (let k = 0; k < n; k++) P_(G.FR.smoke, x + (rnd() - 0.5) * 6, y - 4 + (rnd() - 0.5) * 6, 2, (rnd() - 0.5) * 30, (rnd() - 0.5) * 20, 10 + rnd() * 10, 0.6 + rnd() * 0.4, 6, 12, 0xd0e0e0e0, 0);
    },
    poof(x, y) {
      if (nfx > MAXFX * 0.8) return;
      for (let k = 0; k < 4; k++) { const a = rnd() * 6.28; P_(G.FR.smoke, x + Math.cos(a) * 2, y + Math.sin(a) * 1.5, 0, Math.cos(a) * 10, Math.sin(a) * 6, 6 + rnd() * 6, 0.35 + rnd() * 0.2, 2, 6, 0xf0ffffff, 0); }
    },
    sparkle(x, y, n) {
      for (let k = 0; k < n; k++) { const a = rnd() * 6.28, d = rnd() * 6; P_(G.FR.star, x + Math.cos(a) * d, y + Math.sin(a) * d, 0, 0, 0, 6 + rnd() * 8, 0.6 + rnd() * 0.5, 2.6, 0.5, 0xff80f0ff, 32); }
    },
    note(x, y) { P_(G.FR.note, x + (rnd() - 0.5) * 4, y, 0, (rnd() - 0.5) * 4, 0, 10, 1.4, 3.6, 3.6, 0xffffffff, 0); },
    zzz(x, y) { P_(G.FR.zzz, x + 2, y, 0, 3, 0, 6, 1.6, 3.4, 2, 0xffffffff, 0); },
    heart(x, y) { for (let k = 0; k < 2; k++) P_(G.FR.heart, x + (rnd() - 0.5) * 4, y, 0, (rnd() - 0.5) * 6, 0, 10 + rnd() * 5, 1.1, 3.4, 2.4, 0xffffffff, 0); },
    tongue(x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
      const i = P_(G.FR.white, x0, y0, 0, 0, 0, 0, 0.15, l, 0.6, 0xff9a7aff, 4);
      if (i >= 0) fxRot[i] = Math.atan2(dy, dx);
    },
    clash(x, y) { for (let k = 0; k < 3; k++) P_(G.FR.star, x, y, 0, (rnd() - 0.5) * 30, (rnd() - 0.5) * 20, 10, 0.35, 2.4, 0.6, 0xffffffff, 0); },
    fly(x, y) { if (nfx < MAXFX * 0.6) P_(G.FR.dot, x + (rnd() - 0.5) * 4, y, 3 + rnd() * 3, (rnd() - 0.5) * 12, (rnd() - 0.5) * 6, (rnd() - 0.5) * 4, 1.2, 0.7, 0.7, 0xff201818, 0); },
    trail(x, y) {
      if (nfx > MAXFX * 0.7) return;
      P_(G.FR.smoke, x + (rnd() - 0.5) * 2, y + (rnd() - 0.5) * 2, 0, 0, 0, 3, 0.5 + rnd() * 0.4, 2, 5, 0xc0e8e8e8, 0);
    },
    heal(x, y) { P_(G.FR.heal, x + (rnd() - 0.5) * 6, y, 2, 0, 0, 18, 0.8, 3, 3, 0xffffffff, 0); },
    tracer(x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
      const i = P_(G.FR.tracer, (x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, 0, 0.08, l, 1.2, 0xc04a7a9a, 1 | 4);
      if (i >= 0) fxRot[i] = Math.atan2(dy, dx);
    },
    muzzle(x, y, face, s = 1) {
      P_(G.FR.flash, x, y, 0, 0, 0, 0, 0.08, 6 * s, 8 * s, 0xff60d0ff, 1);
      if (nfx < MAXFX * 0.8) for (let k = 0; k < 3 * s; k++) P_(G.FR.smoke, x + face * 2, y, 0, face * (10 + rnd() * 20), (rnd() - 0.5) * 10, 4 + rnd() * 6, 1.2 + rnd() * 0.8, 4 * s, 12 * s, 0x90e8e8e8, 0);
    },
    explosion(x, y, R, fire) {
      P_(G.FR.flash, x, y, 2, 0, 0, 0, 0.22, R * 1.6, R * 2.6, 0xff50c0ff, 1);
      P_(G.FR.ring, x, y, 0, 0, 0, 0, 0.25, R * 0.6, R * 2.2, 0x70303a50, 0);
      const dense = nfx < MAXFX * 0.6;
      const n = dense ? Math.min(14, 4 + R / 5) : 2;
      for (let k = 0; k < n; k++) {
        const a = rnd() * 6.28, s = rnd() * R * 0.6;
        if (k < n * 0.6) P_(G.FR.smoke, x + Math.cos(a) * s, y + Math.sin(a) * s * 0.6, 2, Math.cos(a) * 20, Math.sin(a) * 12, 14 + rnd() * 18, 0.7 + rnd() * 0.8, R * 0.3, R * 0.75, fire ? 0xa0c8ccd4 : 0xa0dcdcdc, 0);
        P_(G.FR.flame, x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.4, 3, Math.cos(a) * 30, Math.sin(a) * 18, 20 + rnd() * 20, 0.25 + rnd() * 0.25, R * 0.3, R * 0.6, 0xff2080ff, 1);
      }
      if (dense) for (let k = 0; k < n; k++) P_(G.FR.chip, x, y, 3, (rnd() - 0.5) * R * 6, (rnd() - 0.5) * R * 3, 40 + rnd() * 70, 0.6 + rnd() * 0.4, 1.4, 1.4, 0xff304050, 2);
      if (rnd() < 0.35) fx.decal(G.FR.scorch, x, y, R * 1.2, R * 0.85, rnd() * 6, 0x60ffffff);
      G.shake = Math.min(8, (G.shake || 0) + R * 0.04);
    },
    debris(x, y, col, n = 5) {
      for (let k = 0; k < n; k++) P_(G.FR.chip, x, y, 4, (rnd() - 0.5) * 60, (rnd() - 0.5) * 30, 30 + rnd() * 50, 0.5 + rnd() * 0.4, 1.6, 1.6, col, 2);
      P_(G.FR.smoke, x, y, 3, 0, 0, 10, 0.8, 5, 10, 0x80a0b0c0, 0);
    },
    burst(x, y, r, n) {
      for (let k = 0; k < n; k++) {
        const a = rnd() * 6.28, s = rnd() * r;
        P_(G.FR.smoke, x + Math.cos(a) * s, y + Math.sin(a) * s * 0.6, 4, Math.cos(a) * 15, Math.sin(a) * 8, 10 + rnd() * 20, 1.4 + rnd(), r * 0.3, r * 0.8, 0xb0d8d8d8, 0);
        P_(G.FR.chip, x + Math.cos(a) * s, y, r * 0.5, (rnd() - 0.5) * 80, (rnd() - 0.5) * 30, 40 + rnd() * 60, 0.8, 2, 2, 0xff5a6a7a, 2);
      }
    },
    fireCell(x, y, tt) {
      if (nfx > MAXFX * 0.75) return;
      const big = tt === T.FOREST || tt === T.PALI;
      P_(G.FR.flame, x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6, big ? 6 : 2, (rnd() - 0.5) * 6, 0, 14 + rnd() * 16, 0.4 + rnd() * 0.4, big ? 6 : 4, 1.5, 0xff2a8cff, 1);
      if (rnd() < 0.25) P_(G.FR.smoke, x, y, big ? 12 : 5, (rnd() - 0.5) * 6 + G.S.wind * 20, 0, 14 + rnd() * 10, 1.6 + rnd(), 4, 14, 0x80d0d0d0, 0);
    },
    unitFire(x, y) {
      if (nfx > MAXFX * 0.8) return;
      P_(G.FR.flame, x + (rnd() - 0.5) * 4, y, 4 + rnd() * 6, (rnd() - 0.5) * 6, 0, 16 + rnd() * 12, 0.35 + rnd() * 0.2, 4, 1, 0xff2a8cff, 1);
    },
    buildingFire(x, y, r) {
      if (nfx > MAXFX * 0.8) return;
      const ox = (rnd() - 0.5) * r * 1.6;
      P_(G.FR.flame, x + ox, y, r * (0.4 + rnd() * 0.8), (rnd() - 0.5) * 6, 0, 18 + rnd() * 14, 0.5 + rnd() * 0.3, r * 0.35, r * 0.1, 0xff2a8cff, 1);
      if (rnd() < 0.3) P_(G.FR.smoke, x + ox, y, r, (rnd() - 0.5) * 6, 0, 20, 2, r * 0.3, r * 1.1, 0x90d0d0d0, 0);
    },
  });

  function updateFx(dt) {
    let n = nfx;
    for (let i = 0; i < n; i++) {
      fxL[i] -= dt;
      if (fxL[i] <= 0) {
        
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
    gl.uniform1f(ug.uMid, 0);
    const L = R.light(S);
    gl.uniform3f(ug.uLight, L[0], L[1], L[2]); gl.uniform1f(ug.uSnow, S.snow || 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texTerr); gl.uniform1i(ug.uTerr, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texDecal); gl.uniform1i(ug.uDecal, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---------------- build instances
    const now = performance.now() / 1000;
    ni = 0;
    let at = 0;
    const passes = [];
    const fw = R.fw, fh = R.fh;
    const FR = G.FR;
    // pass A: ground-level shadows of flying animals
    const ux = S.x, uy = S.y, upx = S.px, upy = S.py, ut = S.type, ual = S.alive, uface = S.face, uatk = S.atk, ufl = S.flash, uan = S.anim;
    const uz = S.z, usz = S.size, uvar = S.vari, ust = S.state, usex = S.sex;
    const UF = G.unitFrames, UFM = G.unitFramesM, UFL = G.UFL, UR = G.UR, UHAB = G.UHAB;
    const hwu = S.hw;
    let start = ni;
    for (let i = 0; i < hwu; i++) {
      if (!ual[i] || !(UFL[ut[i]] & F.AIR) || uz[i] < 2) continue;
      const x = upx[i] + (ux[i] - upx[i]) * alpha, y = upy[i] + (uy[i] - upy[i]) * alpha;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const r = UR[ut[i]] * usz[i];
      put(x, y, r * 2.2, r * 0.7, 0, FR.shadow, 0x90ffffff, MISC_MULT, 0);
    }
    passes.push([at, flushPlain(start, at)]); at += ni - start;

    // pass B: y-sorted world (plants, animals)
    start = ni;
    for (let k = 0; k < nObj; k++) {
      const x = objX[k], y = objY[k];
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const f = objF[k], sc = objS[k];
      put(x, y, fw[f] * sc, fh[f] * sc, 0, f, objC[k], MISC_MULT, (y + 64) | 0);
    }
    const SLEEP = S.ST.SLEEP, REST = S.ST.REST, disco = S.disco > 0, gcoat = S.stats && S.stats.tCoat;
    const night = S.isNight();
    for (let i = 0; i < hwu; i++) {
      if (!ual[i]) continue;
      const x = upx[i] + (ux[i] - upx[i]) * alpha;
      if (x < vx0 || x > vx1) continue;
      const y = upy[i] + (uy[i] - upy[i]) * alpha;
      if (y < vy0 || y > vy1) continue;
      const t = ut[i], fl = UFL[t];
      const base = (usex[i] ? UFM : UF), o = t * 4;
      let f, bob = 0, key = (y + 64) | 0, z = 0;
      const moving = ux[i] !== upx[i] || uy[i] !== upy[i];
      if (fl & F.CARCASS) f = base[o];
      else if (fl & F.AIR) {
        z = uz[i];
        if (z < 1.5 && !moving) f = base[o + 3];
        else if (uatk[i] > 0 && z > 3) f = base[o + 2];
        else f = base[o + ((((now * (UR[t] < 2 ? 30 : 6)) | 0) + i) & 1)];
        if (z > 1) { key = Math.min(NKEY - 1, key + 2000); z += Math.sin(now * 2 + i) * 0.8; }
      } else if (ust[i] === SLEEP || (ust[i] === REST && !(fl & F.STATIC) && UHAB[t] !== 1)) f = base[o + 3];
      else if (uatk[i] > 0) f = base[o + 2];
      else {
        const ph = uan[i];
        f = base[o + (moving ? ((ph | 0) & 1) : 0)];
        if (moving && !(fl & F.STATIC) && UHAB[t] !== 1) bob = Math.abs(Math.sin(ph * 3.14159)) * 0.5;
      }
      if (!(fl & F.AIR) && uz[i] > 0) z = uz[i]; // hops & leaps
      const sc = usz[i];
      let col = 0xffffffff, fla = ufl[i] > 0 ? 160 : 0, alphaA = 255;
      if (gcoat && !(fl & F.STATIC)) { const k = 255 - ((gcoat[i] * 70) | 0); col = (0xff000000 | (k << 16) | (k << 8) | Math.min(255, k + 12)) >>> 0; } // thick coat = darker fur
      if (uvar[i] === 1) { col = 0xff40d8ff; }                 // golden
      else if (uvar[i] === 2) { fla = Math.max(fla, 150); }    // albino
      if (disco) { const h = (now * 2 + i * 0.37) % 1; col = hsl(h); }
      if (UHAB[t] === 1) { alphaA = 190; col = 0xffffd8c8; }    // fish: under water, bluish
      if (t === G.U.nessie && ((now * 0.2 + i) % 1) > 0.8) alphaA = 120;
      put(x, y - bob - z, fw[f] * sc * uface[i], fh[f] * sc, 0, f, col, misc(fla, 0, 1, alphaA), key);
      if (uvar[i] === 4) put(x + uface[i] * UR[t] * 1.5 * sc, y - z - UR[t] * 0.9, 2.4, 2, 0, FR.cheese, 0xffffffff, MISC_MULT, key + 1);
      if (uvar[i] === 1 && ((now * 3 + i) % 1) < 0.08) fx.sparkle(x, y - 4, 1);
      if (fl & F.MAGIC && t === G.U.unicorn && rnd() < 0.05) fx.sparkle(x, y - 10, 1);
    }
    passes.push([at, flushSorted(start, at)]); at += ni - start;

    // weather & ambient particles (spawned per frame, screen-space density)
    if (simDt > 0) {
      const area = (vx1 - vx0) * (vy1 - vy0);
      if (S.rain > 0.05) {
        const snow = S.weather === 'snow';
        const n = Math.min(40, area * S.rain / (snow ? 12000 : 5000));
        for (let k = 0; k < n; k++) {
          const xx = vx0 + rnd() * (vx1 - vx0), yy = vy0 + rnd() * (vy1 - vy0);
          if (snow) P_(G.FR.dot, xx, yy, 40, (rnd() - 0.5) * 8, 0, -14 - rnd() * 8, 3, 1.1, 1.1, 0xf0ffffff, 0);
          else P_(G.FR.drop, xx, yy, 50, -6, 0, -260, 0.2, 2, 8, 0xc0ffffff, 0);
        }
      }
      // fireflies: warm nights near water and forest
      if (night && S.season() === 1 && rnd() < 0.6) {
        for (let k = 0; k < 3; k++) {
          const xx = vx0 + rnd() * (vx1 - vx0), yy = vy0 + rnd() * (vy1 - vy0);
          const tt = S.terr[S.tcell(Math.max(0, Math.min(S.W - 1, xx)), Math.max(0, Math.min(S.H - 1, yy)))];
          if (tt === T.FOREST || tt === T.REEDS || tt === T.TALL || tt === T.WATER) P_(G.FR.glow, xx, yy, 4 + rnd() * 6, (rnd() - 0.5) * 8, (rnd() - 0.5) * 6, (rnd() - 0.5) * 3, 2 + rnd() * 2, 2.2, 2.2, 0xff60ffd0, 32);
        }
      }
    }

    // pass C: particles
    start = ni;
    for (let i = 0; i < nfx; i++) {
      const x = fxX[i], y = fxY[i];
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const life = fxL[i] / fxM[i];
      const fl = fxFl[i];
      const f = fxF[i];
      const c = fxC[i];
      let a = ((c >>> 24) * (fl & 1 ? life : Math.min(1, life * 2.2))) | 0;
      if (fl & 32) a = ((c >>> 24) * (0.5 + 0.5 * Math.sin(now * 6 + i))) | 0;
      const col = ((c & 0xffffff) | (a << 24)) >>> 0;
      const m = fl & 32 ? MISC_GLOW : MISC_MULT;
      if (fl & 4) { put(x, y - fxZ[i], fxS0[i], fxS1[i], fxRot[i], f, col, m, 0); continue; }
      const sz = fxS1[i] + (fxS0[i] - fxS1[i]) * life;
      put(x, y - fxZ[i], sz, sz, fxRot[i], f, col, m, 0);
    }
    passes.push([at, flushPlain(start, at)]); at += ni - start;

    // pass D: overlays
    start = ni;
    if (G.ui && G.ui.selected >= 0 && ual[G.ui.selected]) {
      const i = G.ui.selected, t = ut[i];
      const x = upx[i] + (ux[i] - upx[i]) * alpha, y = upy[i] + (uy[i] - upy[i]) * alpha;
      const r = Math.max(4, UR[t] * 1.6);
      put(x, y - (UFL[t] & F.AIR ? uz[i] : 0), r * 2 / 0.875, r * 1.2 / 0.875, 0, FR.ring, 0xff3cc8ff, MISC_MULT, 0);
    }
    // brush preview & selection ring
    if (G.ui && G.ui.brushPreview) {
      const b = G.ui.brushPreview;
      put(b.x, b.y, b.r * 2 / 0.875, b.r * 2 / 0.875, 0, FR.ring, b.col, MISC_MULT, 0);
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
