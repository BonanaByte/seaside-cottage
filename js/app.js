const $ = s => document.querySelector(s);

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isPhone = () => innerWidth <= 720;
let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600); }

function fmtTime(tz) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date()); }

const randomLine = lines => lines[Math.floor(Math.random() * lines.length)];

function completeTask(id) {
  const task = document.getElementById("task-" + id);
  if (!task || task.classList.contains("done")) return;
  task.classList.add("done");
  const count = document.querySelectorAll(".tasks li.done").length;
  $("#progress").textContent = count + "/3";
  toast("已完成：" + task.textContent);
}

let onNote;

/* ---------- sound (Web Audio, starts only after a click) ---------- */
let AC = null;
function audio() { try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); } catch (e) {} return AC; }

/* Piano voice: two slightly detuned "strings" + a bright hammer layer + a soft felt thump,
   a filter that closes as the note decays, and a small-room reverb. Low notes ring longer. */
let PIANO_BUS = null; const PIANO_WAVES = {};
function pianoBus(a) {
  if (PIANO_BUS) return PIANO_BUS;
  const input = a.createGain(), dry = a.createGain(), wet = a.createGain(), rev = a.createConvolver(), dark = a.createBiquadFilter(), comp = a.createDynamicsCompressor();
  const len = Math.floor(a.sampleRate * 2.6), ir = a.createBuffer(2, len, a.sampleRate), pre = Math.floor(a.sampleRate * .015);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = i < pre ? 0 : (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4); }
  rev.buffer = ir; dark.type = "lowpass"; dark.frequency.value = 4200;
  dry.gain.value = .85; wet.gain.value = .26;
  comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 3; comp.attack.value = .004; comp.release.value = .3;
  input.connect(dry); input.connect(dark); dark.connect(rev); rev.connect(wet); dry.connect(comp); wet.connect(comp); comp.connect(a.destination);
  return (PIANO_BUS = input);
}
function pianoWave(a, kind) {
  if (PIANO_WAVES[kind]) return PIANO_WAVES[kind];
  const N = kind === "body" ? 12 : 28, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) im[n] = kind === "body" ? [0, 1, .52, .3, .2, .12, .08, .05, .035, .025, .018, .012, .008][n] : (1 / Math.pow(n, .75)) * (n % 7 === 0 ? .3 : 1);
  return (PIANO_WAVES[kind] = a.createPeriodicWave(re, im));
}
let PIANO_NOISE = null;
function playMidi(m, when = 0, dur = 0, vol = .2) {
  const a = audio(); if (!a) return;
  const bus = pianoBus(a), f = 440 * Math.pow(2, (m - 69) / 12), t = a.currentTime + when + .004;
  const life = dur || Math.max(1.4, 4.6 - (m - 48) * .08);
  const out = a.createGain(); out.gain.value = vol * 1.6;
  if (a.createStereoPanner) { const pn = a.createStereoPanner(); pn.pan.value = Math.max(-.55, Math.min(.55, (m - 62) / 36)); out.connect(pn); pn.connect(bus); } else out.connect(bus);
  const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = .5;
  lp.frequency.setValueAtTime(Math.min(14000, f * (7 + vol * 30)), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(f * 2.4, 500), t + Math.min(life * .7, 2.2));
  lp.connect(out);
  [-1.6, 1.4].forEach(c => {           // two strings, slightly out of tune with each other = warm beating
    const o = a.createOscillator(), g = a.createGain();
    o.setPeriodicWave(pianoWave(a, "body")); o.frequency.value = f; o.detune.value = c;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.42, t + .005);
    g.gain.exponentialRampToValueAtTime(.16, t + .28); g.gain.exponentialRampToValueAtTime(.0006, t + life);
    o.connect(g); g.connect(lp); o.start(t); o.stop(t + life + .05);
  });
  const ob = a.createOscillator(), gb = a.createGain();   // hammer brightness, gone in a moment
  ob.setPeriodicWave(pianoWave(a, "bright")); ob.frequency.value = f; ob.detune.value = 4;
  gb.gain.setValueAtTime(0, t); gb.gain.linearRampToValueAtTime(.22, t + .002); gb.gain.exponentialRampToValueAtTime(.001, t + .12 + Math.max(0, 84 - m) * .004);
  ob.connect(gb); gb.connect(lp); ob.start(t); ob.stop(t + .6);
  if (!PIANO_NOISE) { PIANO_NOISE = a.createBuffer(1, Math.floor(a.sampleRate * .06), a.sampleRate); const d = PIANO_NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const ns = a.createBufferSource(), bp = a.createBiquadFilter(), gn = a.createGain();   // felt thump
  ns.buffer = PIANO_NOISE; bp.type = "bandpass"; bp.frequency.value = Math.min(3200, f * 2.5); bp.Q.value = 1.4;
  gn.gain.setValueAtTime(.05 + vol * .2, t); gn.gain.exponentialRampToValueAtTime(.0005, t + .035);
  ns.connect(bp); bp.connect(gn); gn.connect(out); ns.start(t); ns.stop(t + .06);
}
/* clicking the piano in the room: a soft rolled Cmaj9 */
function playArp() { [48, 55, 64, 71, 74].forEach((m, i) => { playMidi(m, i * .07, 0, i ? .13 : .16); setTimeout(() => onNote && onNote(m - 60 + i * 3), i * 70); }); }

const DRAW = {
  erhai(x, w, h) {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#F6C9B8"); g.addColorStop(.55, "#E8D9E6"); g.addColorStop(1, "#AFC3E6"); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#FFF3D6"; x.beginPath(); x.arc(w * .68, h * .3, h * .08, 0, 7); x.fill();
    x.fillStyle = "rgba(120,130,170,.55)"; x.beginPath(); x.moveTo(0, h * .52); for (let i = 0; i <= 10; i++) x.lineTo(w * i / 10, h * (.36 + (i % 2) * .08 + Math.sin(i) * .03)); x.lineTo(w, h * .56); x.lineTo(0, h * .56); x.fill();
    x.fillStyle = "rgba(255,255,255,.5)"; x.fillRect(0, h * .46, w, h * .08);
    x.fillStyle = "#9FB4DA"; x.fillRect(0, h * .56, w, h * .44);
    x.strokeStyle = "rgba(255,255,255,.6)"; x.lineWidth = 2; for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(w * .1 + i * 31, h * (.66 + (i % 3) * .08)); x.lineTo(w * .1 + i * 31 + 18, h * (.66 + (i % 3) * .08)); x.stroke(); }
    x.fillStyle = "#2B3563"; [[.18, .3], [.26, .24], [.82, .28]].forEach(([tx, th]) => { x.fillRect(w * tx, h * (.56 - th), 3, h * th + h * .12); x.beginPath(); x.moveTo(w * tx - 9, h * (.56 - th * .3)); x.lineTo(w * tx + 1.5, h * (.56 - th - .04)); x.lineTo(w * tx + 12, h * (.56 - th * .3)); x.fill(); });
  },
  nyc(x, w, h) {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#F6C9B8"); g.addColorStop(1, "#AFC3E6"); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#FFF3D6"; x.beginPath(); x.arc(w * .72, h * .3, h * .1, 0, 7); x.fill();
    const bs = [[.02, .55, .12], [.13, .4, .1], [.24, .62, .09], [.33, .3, .11], [.45, .5, .1], [.56, .2, .08], [.65, .45, .12], [.78, .58, .1], [.88, .38, .12]];
    bs.forEach(([bx, by, bw], i) => {
      x.fillStyle = i % 2 ? "#3A4778" : "#2B3563"; x.fillRect(bx * w, by * h, bw * w, h);
      x.fillStyle = "rgba(255,236,170,.75)";
      for (let yy = by * h + 10; yy < h - 6; yy += 14) for (let xx = bx * w + 5; xx < (bx + bw) * w - 6; xx += 9) if ((xx * 7 + yy * 3) % 5 < 2) x.fillRect(xx, yy, 4, 6);
    });
    x.fillStyle = "#2B3563"; x.fillRect(.585 * w, .08 * h, 4, .12 * h);
  },
  bj(x, w, h) {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#AFC3E6"); g.addColorStop(1, "#F9D9C8"); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#FFF3D6"; x.beginPath(); x.arc(w * .2, h * .22, h * .08, 0, 7); x.fill();
    const cx = w / 2, base = h * .86;
    x.fillStyle = "#FFFDF9"; x.fillRect(cx - 80, base - 18, 160, 18); x.fillRect(cx - 64, base - 32, 128, 14);
    [[100, 54, base - 32], [80, 44, base - 76], [60, 36, base - 112]].forEach(([rw, bh, y], i) => {
      x.fillStyle = "#E2434F"; x.fillRect(cx - rw * .42, y - bh * .55, rw * .84, bh * .55);
      x.fillStyle = "#1C2342"; x.beginPath(); x.moveTo(cx - rw * .62, y - bh * .55); x.quadraticCurveTo(cx, y - bh * 1.25, cx + rw * .62, y - bh * .55); x.closePath(); x.fill();
    });
    x.fillStyle = "#D9B37A"; x.beginPath(); x.arc(cx, base - 168, 7, 0, 7); x.fill();
    x.fillStyle = "#7A8BB8"; x.fillRect(0, base, w, h - base);
  },
  coffee(x, w, h) {
    x.fillStyle = "#E9D9C4"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#fff"; x.beginPath(); x.arc(w / 2, h / 2, h * .36, 0, 7); x.fill();
    x.fillStyle = "#7A4B2E"; x.beginPath(); x.arc(w / 2, h / 2, h * .28, 0, 7); x.fill();
    x.strokeStyle = "#F3E3CC"; x.lineWidth = 5; x.beginPath(); x.moveTo(w / 2, h / 2 + 22); x.bezierCurveTo(w / 2 - 34, h / 2 - 10, w / 2 - 10, h / 2 - 30, w / 2, h / 2 - 8); x.bezierCurveTo(w / 2 + 10, h / 2 - 30, w / 2 + 34, h / 2 - 10, w / 2, h / 2 + 22); x.stroke();
  },
  moon(x, w, h) {
    x.fillStyle = "#1C2342"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#FFF3D6"; x.beginPath(); x.arc(w * .55, h * .45, h * .22, 0, 7); x.fill();
    x.fillStyle = "#1C2342"; x.beginPath(); x.arc(w * .63, h * .4, h * .2, 0, 7); x.fill();
    x.fillStyle = "#D6F04F"; for (let i = 0; i < 14; i++) { x.fillRect((i * 97) % w, (i * 53) % h, 3, 3); }
  }
};

async function init3D() {
  if (!window.THREE && !window.__T) throw new Error("three.js not loaded");
  const T = window.__T || window.THREE;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;

  const canvas = $("#gl");
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isPhone() ? 1.6 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .94;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();
  const DAY_BG = new T.Color("#CBD7EA"), NIGHT_BG = new T.Color("#151B36");
  scene.background = DAY_BG.clone();

  if (T.RoomEnvironment) {
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;
  }

  const camera = new T.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);

  /* ---------- helpers ---------- */
  const allMats = [];
  const M = (color, o = {}) => { const m = new T.MeshStandardMaterial(Object.assign({ color, roughness: .62, metalness: 0 }, o)); allMats.push(m); return m; };
  const shade = o => { o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; };
  function geoRBox(w, h, d, r = .08) {
    const rr = Math.min(r, Math.min(w, h, d) / 2 - .001);
    return T.RoundedBoxGeometry && rr > .005 ? new T.RoundedBoxGeometry(w, h, d, 4, rr) : new T.BoxGeometry(w, h, d);
  }
  function rbox(w, h, d, r, mat) { const m = new T.Mesh(geoRBox(w, h, d, r), mat.isMaterial ? mat : M(mat)); m.castShadow = m.receiveShadow = true; return m; }
  function cyl(rt, rb, h, mat, seg = 32) { const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), mat.isMaterial ? mat : M(mat)); m.castShadow = m.receiveShadow = true; return m; }
  function sph(r, mat, seg = 24) { const m = new T.Mesh(new T.SphereGeometry(r, seg, Math.round(seg * .75)), mat.isMaterial ? mat : M(mat)); m.castShadow = m.receiveShadow = true; return m; }
  function ctex(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); draw(x, w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.userData = { canvas: c, draw }; return t; }
  function plane(w, h, tex, o = {}) { const mat = new T.MeshStandardMaterial(Object.assign({ map: tex, roughness: .8 }, o)); allMats.push(mat); const m = new T.Mesh(new T.PlaneGeometry(w, h), mat); m.receiveShadow = true; return m; }
  function basicPlane(w, h, tex, o = {}) { return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial(Object.assign({ map: tex, toneMapped: false }, o))); }
  const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

  const root = new T.Group(); scene.add(root);
  const intro = []; // groups that drop in
  const addIntro = (g, delay) => { intro.push({ g, y: g.position.y, delay }); root.add(g); return g; };

  /* ---------- lights ---------- */
  const hemi = new T.HemisphereLight(0xffffff, 0xb6c2dc, .55); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff1de, 1.7);
  sun.position.set(9, 15, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(isPhone() ? 1024 : 2048, isPhone() ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = .02; sun.shadow.radius = 5;
  scene.add(sun);

  /* ---------- room ---------- */
  const room = new T.Group();
  const floor = rbox(14, .6, 14, .18, M("#E9DAC5", { roughness: .8 })); at(floor, 0, -.3, 0); room.add(floor);
  const planks = ctex(1024, 1024, (x, w, h) => {
    x.fillStyle = "#E9DAC5"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? "rgba(160,120,80,.06)" : "rgba(255,255,255,.08)"; x.fillRect(0, i * 64, w, 64); x.fillStyle = "rgba(120,85,50,.16)"; x.fillRect(0, i * 64, w, 2);
      const off = (i * 377) % 512; x.fillRect(off, i * 64, 2, 64); x.fillRect((off + 512) % w, i * 64, 2, 64); }
  });
  const fl = plane(13.7, 13.7, planks, { roughness: .75 }); fl.rotation.x = -Math.PI / 2; at(fl, 0, .002, 0); room.add(fl);
  const wallB = rbox(14, 8, .4, .12, M("#DCE5F2", { roughness: .9 })); at(wallB, 0, 4, -6.8); room.add(wallB);
  const wallL = rbox(.4, 8, 14, .12, M("#D1DCEE", { roughness: .9 })); at(wallL, -6.8, 4, 0); room.add(wallL);
  const capMat = M("#FFFDF9"); room.add(at(rbox(14.2, .14, .6, .06, capMat), 0, 8.02, -6.8), at(rbox(.6, .14, 14.2, .06, capMat), -6.8, 8.02, 0));
  room.add(at(rbox(13.2, .3, .08, .03, capMat), .4, .15, -6.56), at(rbox(.08, .3, 13.2, .03, capMat), -6.56, .15, .4));
  // floating shadow under the diorama
  const blob = basicPlane(26, 26, ctex(256, 256, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); g.addColorStop(0, "rgba(28,35,66,.28)"); g.addColorStop(1, "rgba(28,35,66,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); }), { transparent: true, depthWrite: false });
  blob.rotation.x = -Math.PI / 2; at(blob, .5, -1.6, .5); room.add(blob);
  // rug
  const rug = new T.Mesh(new T.CylinderGeometry(3.4, 3.4, .04, 64), new T.MeshStandardMaterial({ roughness: 1, map: ctex(512, 512, (x, w, h) => {
    x.fillStyle = "#F6E3DF"; x.fillRect(0, 0, w, h); x.strokeStyle = "#EDB3B3"; x.lineWidth = 6;
    for (let r = 60; r < 256; r += 46) { x.beginPath(); x.arc(256, 256, r, 0, 7); x.stroke(); }
    x.fillStyle = "#D6F04F"; x.beginPath(); x.arc(256, 256, 34, 0, 7); x.fill();
  }) }));
  rug.material.map.encoding = T.sRGBEncoding; allMats.push(rug.material); rug.receiveShadow = true; at(rug, 1.2, .02, -.6); room.add(rug);
  root.add(room);

  /* ---------- OUTDOORS: sandy island, sea, sakura ---------- */
  blob.visible = false;
  const ISL = { x: 3.5, z: -1.5, r: 11.6 };
  scene.fog = new T.Fog(DAY_BG.clone(), 58, 120);
  const sandTex = ctex(512, 512, (x, w, h) => { x.fillStyle = "#F3E0BA"; x.fillRect(0, 0, w, h); for (let i = 0; i < 4200; i++) { x.fillStyle = i % 3 ? "rgba(190,155,100,.16)" : "rgba(255,255,255,.4)"; x.fillRect((i * 73.7) % w, (i * 41.3) % h, 2, 2); } });
  sandTex.wrapS = sandTex.wrapT = T.RepeatWrapping; sandTex.repeat.set(5, 5);
  const sandM = new T.MeshStandardMaterial({ color: "#ffffff", map: sandTex, roughness: 1 }); allMats.push(sandM);
  const island = new T.Mesh(new T.CylinderGeometry(ISL.r, ISL.r + .8, 1.4, 96), sandM); island.position.set(ISL.x, -.72, ISL.z); island.receiveShadow = true; root.add(island);
  const wet = new T.Mesh(new T.RingGeometry(ISL.r - 1.3, ISL.r + .05, 96), new T.MeshStandardMaterial({ color: "#D8BC88", transparent: true, opacity: .55, roughness: .6, depthWrite: false })); allMats.push(wet.material);
  wet.rotation.x = -Math.PI / 2; wet.position.set(ISL.x, -.012, ISL.z); wet.receiveShadow = true; root.add(wet);
  const waveTex = ctex(256, 256, (x, w, h) => { x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h); x.strokeStyle = "rgba(255,255,255,.0)"; x.strokeStyle = "rgba(90,150,190,.28)"; x.lineWidth = 3; for (let i = 0; i < 10; i++) { x.beginPath(); for (let xx = 0; xx <= w; xx += 8) { const y = i * 26 + Math.sin(xx / 20 + i) * 5; xx ? x.lineTo(xx, y) : x.moveTo(xx, y); } x.stroke(); } });
  waveTex.wrapS = waveTex.wrapT = T.RepeatWrapping; waveTex.repeat.set(30, 30);
  const SEA_DAY = new T.Color("#5DBAD3"), SEA_NIGHT = new T.Color("#22457A");
  const seaM = new T.MeshStandardMaterial({ color: SEA_DAY.clone(), map: waveTex, roughness: .2, metalness: .05 }); allMats.push(seaM);
  const sea = new T.Mesh(new T.PlaneGeometry(260, 260), seaM); sea.rotation.x = -Math.PI / 2; sea.position.set(ISL.x, -.62, ISL.z); sea.receiveShadow = true; root.add(sea);
  const foamM = new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: .75, depthWrite: false });
  const foam = new T.Mesh(new T.RingGeometry(ISL.r + .3, ISL.r + .9, 128), foamM); foam.rotation.x = -Math.PI / 2; foam.position.set(ISL.x, -.6, ISL.z); root.add(foam);
  const foam2 = new T.Mesh(new T.RingGeometry(ISL.r + .5, ISL.r + .75, 128), foamM.clone()); foam2.rotation.x = -Math.PI / 2; foam2.position.set(ISL.x, -.605, ISL.z); root.add(foam2);
  // shells + starfish
  const starTex = ctex(128, 128, (x) => { x.fillStyle = "#F28A63"; x.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 22 : 58; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } x.closePath(); x.fill(); x.fillStyle = "rgba(255,235,210,.7)"; for (let i = 0; i < 12; i++) { x.beginPath(); x.arc(64 + Math.cos(i) * (i % 3) * 12, 64 + Math.sin(i) * (i % 3) * 12, 2.5, 0, 7); x.fill(); } });
  [[10.6, 4.2, .4], [8.4, 7.0, 1.7], [12.2, -2.5, 2.6]].forEach(([x, z, r]) => { const st = new T.Mesh(new T.PlaneGeometry(.7, .7), new T.MeshStandardMaterial({ map: starTex, transparent: true, alphaTest: .4, roughness: .8 })); allMats.push(st.material); st.rotation.set(-Math.PI / 2, 0, r); st.position.set(x, .005, z); st.receiveShadow = true; root.add(st); });
  [[10.2, 5.4, "#F9D7DC"], [11.6, 1.2, "#FFF1E0"], [5.2, 8.4, "#E9DDF5"]].forEach(([x, z, c]) => { const sh = new T.Mesh(new T.SphereGeometry(.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(c, { roughness: .5 })); sh.scale.set(1, .55, 1.25); sh.position.set(x, 0, z); sh.rotation.y = x; sh.castShadow = true; root.add(sh); });
  // sakura trees
  const pinkMs = ["#F9C9D6", "#F5B3C8", "#FCDDE6", "#F2A2BC"].map(c => M(c, { roughness: .85, flatShading: true }));
  const barkM = M("#6E4B3D", { roughness: .9 });
  function sakura(x, z, s) {
    const g = new T.Group(); g.position.set(x, -.02, z); g.scale.setScalar(s);
    const t1 = cyl(.2, .34, 2.3, barkM, 10); t1.position.set(0, 1.15, 0); t1.rotation.z = .08; g.add(t1);
    const t2 = cyl(.13, .2, 1.5, barkM, 10); t2.position.set(-.22, 2.85, .05); t2.rotation.z = .3; g.add(t2);
    const b1 = cyl(.06, .11, 1.5, barkM, 8); b1.position.set(.55, 2.7, .1); b1.rotation.z = -.85; g.add(b1);
    const b2 = cyl(.05, .09, 1.2, barkM, 8); b2.position.set(-.15, 2.6, -.5); b2.rotation.x = .8; g.add(b2);
    const crown = new T.Group(); crown.position.y = 3.5; g.add(crown);
    [[0, .5, 0, 1.25], [-.9, .1, .3, .95], [.95, 0, .1, 1.0], [.2, .2, -.95, .95], [-.3, .1, .95, .9], [.6, .85, .6, .8], [-.6, .9, -.4, .85], [0, 1.25, .1, .75], [1.25, .5, -.6, .7], [-1.3, .5, -.3, .7], [.45, -.4, .75, .7], [-.5, -.35, -.6, .65]]
      .forEach(([bx, by, bz, r], i) => { const m = new T.Mesh(new T.IcosahedronGeometry(r, 1), pinkMs[i % 4]); m.position.set(bx, by, bz); crown.add(m); });
    shade(g); root.add(g);
    return { g, crown, s, x, z, top: new T.Vector3(x, 3.6 * s, z), shake: 0 };
  }
  const trees = [sakura(9.8, -3.6, 1.2), sakura(11.4, -8.6, .9)];
  // fallen petals on the sand
  const petalTex = ctex(64, 64, (x) => { x.fillStyle = "#F7B7C9"; x.beginPath(); x.moveTo(32, 6); x.bezierCurveTo(58, 14, 58, 48, 32, 60); x.bezierCurveTo(6, 48, 6, 14, 32, 6); x.fill(); x.fillStyle = "#FBD9E3"; x.beginPath(); x.ellipse(30, 30, 8, 16, 0, 0, 7); x.fill(); x.clearRect(28, 0, 8, 10); });
  const groundPet = new T.InstancedMesh(new T.PlaneGeometry(.16, .12), new T.MeshStandardMaterial({ map: petalTex, transparent: true, alphaTest: .4, side: T.DoubleSide, roughness: .9 }), 90);
  allMats.push(groundPet.material);
  { const d = new T.Object3D(); for (let i = 0; i < 90; i++) { const tr = trees[i % 2], a = i * 2.4, r = .4 + (i * 37 % 100) / 100 * 2.6 * tr.s; let px = tr.x + Math.cos(a) * r, pz = tr.z + Math.sin(a) * r; if (px < 7.2 && pz < 7.2) px = 7.3 + (i % 5) * .2; d.position.set(px, .006, pz); d.rotation.set(-Math.PI / 2, 0, a); d.updateMatrix(); groundPet.setMatrixAt(i, d.matrix); } }
  root.add(groundPet);
  // falling petals (some drift into the room)
  const NP = 150, fallPet = new T.InstancedMesh(new T.PlaneGeometry(.14, .1), new T.MeshBasicMaterial({ map: petalTex, transparent: true, alphaTest: .35, side: T.DoubleSide, depthWrite: false }), NP);
  fallPet.frustumCulled = false; root.add(fallPet);
  const PT = Array.from({ length: NP }, (_, i) => ({ p: new T.Vector3(), v: new T.Vector3(), r: new T.Euler(), w: new T.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3), ph: Math.random() * 7, tree: i % 3 === 2 ? 1 : 0 }));
  const spawnPetal = (o, burst) => { const tr = trees[o.tree]; o.p.set(tr.x + (Math.random() - .5) * 2.8 * tr.s, tr.top.y + (Math.random() - .3) * 1.4 * tr.s, tr.z + (Math.random() - .5) * 2.8 * tr.s); o.v.set(-.25 - Math.random() * .45 - (burst ? .4 : 0), -.35 - Math.random() * .35, (Math.random() - .5) * .3); };
  PT.forEach(o => { spawnPetal(o); o.p.y -= Math.random() * 4; });
  const pd = new T.Object3D();
  function updateOutdoors(dt) {
    waveTex.offset.x += dt * .012; waveTex.offset.y += dt * .007;
    seaM.color.copy(SEA_DAY).lerp(SEA_NIGHT, nightT);
    scene.fog.color.copy(scene.background);
    foam.scale.setScalar(1 + Math.sin(time * .9) * .012); foamM.opacity = .55 + Math.sin(time * .9) * .2;
    const ft = (time * .25) % 1; foam2.scale.setScalar(1 + ft * .09); foam2.material.opacity = (1 - ft) * .6;
    trees.forEach((tr, i) => { tr.shake = Math.max(0, tr.shake - dt * .9); tr.crown.rotation.z = Math.sin(time * .6 + i) * .025 + tr.shake * Math.sin(time * 28) * .07; tr.crown.rotation.x = Math.sin(time * .5 + i * 2) * .02 + tr.shake * Math.cos(time * 24) * .05; });
    for (let i = 0; i < NP; i++) {
      const o = PT[i]; o.p.addScaledVector(o.v, dt); o.p.x += Math.sin(time * 1.3 + o.ph) * dt * .25; o.p.z += Math.cos(time * 1.1 + o.ph) * dt * .2;
      o.r.x += o.w.x * dt; o.r.y += o.w.y * dt; o.r.z += o.w.z * dt;
      if (o.p.y < .02 || o.p.x < -6.4) spawnPetal(o);
      pd.position.copy(o.p); pd.rotation.copy(o.r); pd.updateMatrix(); fallPet.setMatrixAt(i, pd.matrix);
    }
    fallPet.instanceMatrix.needsUpdate = true;
  }

  /* RUBBER DUCK: rideable, docked on the sea behind-right of the room */
  const duck = new T.Group(), duckBody = new T.Group(); duck.add(duckBody);
  const duckY = new T.MeshPhysicalMaterial({ color: "#FFD23F", roughness: .22, clearcoat: 1, clearcoatRoughness: .1 }); allMats.push(duckY);
  const duckO = M("#FF8A1F", { roughness: .35 });
  const dPart = (geo, mat, x, y, z, sx, sy, sz) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = m.receiveShadow = true; duckBody.add(m); return m; };
  dPart(new T.SphereGeometry(1, 48, 32), duckY, 0, .55, 0, 1.35, .95, 1.85);
  dPart(new T.SphereGeometry(.55, 28, 18), duckY, 0, 1.05, -1.6, 1, .8, 1.1).rotation.x = -.6;
  dPart(new T.SphereGeometry(.85, 40, 28), duckY, 0, 2.05, 1.25, 1, 1, 1);
  dPart(new T.SphereGeometry(.42, 28, 18), duckO, 0, 1.9, 2.02, 1.25, .45, 1.1);
  [-1, 1].forEach(sd => {
    dPart(new T.SphereGeometry(.5, 24, 16), duckY, sd * 1.22, .9, -.1, .35, .62, 1.05).rotation.z = sd * .3;
    dPart(new T.SphereGeometry(.19, 16, 12), M("#FFFFFF", { roughness: .3 }), sd * .36, 2.32, 1.88, 1, 1, .7);
    dPart(new T.SphereGeometry(.12, 14, 10), M("#1C2342", { roughness: .2 }), sd * .38, 2.33, 2.02, 1, 1, .6);
    dPart(new T.SphereGeometry(.04, 8, 6), M("#FFFFFF", { roughness: .2 }), sd * .34, 2.39, 2.08, 1, 1, 1);
    dPart(new T.SphereGeometry(.14, 12, 8), M("#FF9FB0", { roughness: .6 }), sd * .62, 1.98, 1.78, 1, .55, .4);
  });
  duck.scale.setScalar(1.1); root.add(duck);
  const DUCK = { R: ISL.r + 2.6, a0: 295 * Math.PI / 180, a: 295 * Math.PI / 180, seat: new T.Vector3(0, 1.42, -.25) };
  const duckPlace = (a) => { duck.position.set(ISL.x + Math.cos(a) * DUCK.R, -.85, ISL.z + Math.sin(a) * DUCK.R); duck.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)); };
  duckPlace(DUCK.a0);
  // wake rings behind the duck
  const wakeM = new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false });
  const wakes = Array.from({ length: 16 }, () => { const w = new T.Mesh(new T.RingGeometry(.5, .75, 32), wakeM.clone()); w.rotation.x = -Math.PI / 2; w.userData.t = 1; root.add(w); return w; });
  let wakeI = 0, wakeTimer = 0;
  function burstPetals(ti) { let n = 0; for (let i = 0; i < NP && n < 50; i++) if (PT[i].tree === ti || Math.random() < .3) { PT[i].tree = ti; spawnPetal(PT[i], true); n++; } }

  /* window with skyline (day + night layers) */
  const skyDay = ctex(512, 384, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#8FB4E8"); g.addColorStop(1, "#F5D9C8"); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "rgba(255,255,255,.85)"; [[80, 70, 50], [120, 60, 36], [360, 100, 44], [400, 90, 30]].forEach(([a, b, r]) => { x.beginPath(); x.ellipse(a, b, r, r * .45, 0, 0, 7); x.fill(); });
    const bs = [[0, 230, 50], [46, 180, 40], [84, 250, 46], [128, 140, 36], [166, 210, 54], [222, 110, 30], [252, 190, 50], [304, 240, 40], [344, 160, 46], [392, 220, 52], [446, 180, 66]];
    bs.forEach(([bx, by, bw], i) => { x.fillStyle = i % 2 ? "#9AAAD0" : "#8698C4"; x.fillRect(bx, by, bw, h); });
    x.fillStyle = "#8698C4"; x.fillRect(235, 70, 4, 42);
  });
  const skyNight = ctex(512, 384, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#0E1330"); g.addColorStop(1, "#3B3F7A"); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#fff"; for (let i = 0; i < 60; i++) x.fillRect((i * 137) % w, (i * 71) % 180, 2, 2);
    x.fillStyle = "#FFF1C9"; x.beginPath(); x.arc(400, 70, 26, 0, 7); x.fill(); x.fillStyle = "#0E1330"; x.beginPath(); x.arc(412, 62, 24, 0, 7); x.fill();
    const bs = [[0, 230, 50], [46, 180, 40], [84, 250, 46], [128, 140, 36], [166, 210, 54], [222, 110, 30], [252, 190, 50], [304, 240, 40], [344, 160, 46], [392, 220, 52], [446, 180, 66]];
    bs.forEach(([bx, by, bw], i) => { x.fillStyle = i % 2 ? "#1E2550" : "#171D42"; x.fillRect(bx, by, bw, h);
      x.fillStyle = "#FFD98A"; for (let yy = by + 8; yy < h; yy += 14) for (let xx = bx + 5; xx < bx + bw - 5; xx += 9) if ((xx * 13 + yy * 7) % 7 < 2) x.fillRect(xx, yy, 4, 6); });
    x.fillStyle = "#171D42"; x.fillRect(235, 70, 4, 42); x.fillStyle = "#E2434F"; x.beginPath(); x.arc(237, 68, 4, 0, 7); x.fill();
  });
  const win = new T.Group();
  win.add(at(rbox(.3, 3.3, 4.3, .08, capMat), 0, 0, 0));
  const gDay = basicPlane(3.9, 2.9, skyDay); gDay.rotation.y = Math.PI / 2; at(gDay, .16, 0, 0); win.add(gDay);
  const gNight = basicPlane(3.9, 2.9, skyNight, { transparent: true, opacity: 0 }); gNight.rotation.y = Math.PI / 2; at(gNight, .165, 0, 0); win.add(gNight);
  win.add(at(rbox(.12, 2.9, .1, .03, capMat), .2, 0, 0), at(rbox(.12, .1, 3.9, .03, capMat), .2, 0, 0));
  win.add(at(rbox(.6, .12, 4.6, .05, capMat), .25, -1.7, 0));
  at(win, -6.55, 4.6, 2.9); root.add(win);
  // small cactus on sill
  const cac = new T.Group(); cac.add(at(cyl(.16, .13, .26, "#FFFDF9"), 0, .13, 0), at(sph(.13, M("#6FA57C")), 0, .38, 0)); cac.children[1].scale.set(1, 1.6, 1);
  at(cac, -6.2, 2.96, 4.3); root.add(cac);

  /* corkboard (ABOUT) */
  const cork = new T.Group();
  cork.add(at(rbox(4.7, 2.9, .18, .06, M("#C79C6E")), 0, 0, 0));
  const corkTex = ctex(512, 320, (x, w, h) => { x.fillStyle = "#C9A27A"; x.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${90 + (i % 60)},${60 + (i % 40)},30,${.15 + (i % 5) / 20})`; x.fillRect((i * 97.3) % w, (i * 53.7) % h, 2, 2); } });
  cork.add(at(plane(4.4, 2.6, corkTex, { roughness: 1 }), 0, 0, .095));
  const pinMat = M("#E2434F", { roughness: .3 });
  [["nyc", -1.55, .3, -.08], ["bj", -.35, -.15, .06], ["coffee", .85, .25, -.05], ["moon", 1.75, -.45, .1]].forEach(([d, px, py, rz], i) => {
    const pt = ctex(256, 300, (x, w, h) => { x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.save(); x.translate(14, 14); DRAW[d](x, w - 28, 228); x.restore();
      x.fillStyle = "#1C2342"; x.font = "700 30px Caveat, cursive"; x.textAlign = "center"; x.fillText(["城市", "楼阁", "咖啡", "月夜"][i], w / 2, h - 22); });
    const p = plane(.92, 1.08, pt, { roughness: .6 }); p.rotation.z = rz; at(p, px, py, .11 + i * .004); p.castShadow = true; cork.add(p);
    cork.add(at(sph(.05, pinMat, 12), px, py + .46, .16));
  });
  const note = (c, txt, px, py, rz) => { const t = ctex(200, 200, (x, w, h) => { x.fillStyle = c; x.fillRect(0, 0, w, h); x.fillStyle = "#1C2342"; x.font = "34px 'ZCOOL KuaiLe', cursive"; x.textAlign = "center"; txt.split("\n").forEach((l, i) => x.fillText(l, w / 2, 80 + i * 44)); });
    const p = plane(.62, .62, t); p.rotation.z = rz; at(p, px, py, .13); cork.add(p); };
  note("#D6F04F", "保持\n好奇", -1.9, -.85, .12); note("#F9C6CC", "记得浇水", .25, -.95, -.08);
  at(cork, .2, 5.5, -6.45); addIntro(cork, .5);

  /* poster */
  const poster = plane(1.8, 2.5, ctex(360, 500, (x, w, h) => {
    x.fillStyle = "#1C2342"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#D6F04F"; x.font = "64px Gloock, serif"; x.fillText("纽约", 26, 140);
    x.strokeStyle = "#FFFDF9"; x.setLineDash([6, 8]); x.lineWidth = 3; x.beginPath(); x.moveTo(60, 200); x.bezierCurveTo(300, 220, 40, 330, 280, 340); x.stroke(); x.setLineDash([]);
    x.fillStyle = "#E2434F"; x.beginPath(); x.arc(60, 200, 9, 0, 7); x.arc(280, 340, 9, 0, 7); x.fill();
    x.fillStyle = "#FFFDF9"; x.font = "900 54px 'Noto Serif SC', serif"; x.fillText("北京", 26, 440); x.font = "600 18px 'Instrument Sans', sans-serif"; 
  }));
  at(poster, 4.6, 5.1, -6.58); root.add(poster);

  /* string lights */
  const bulbs = [];
  const bulbMat = new T.MeshStandardMaterial({ color: "#FFE3A3", emissive: new T.Color("#FFB648"), emissiveIntensity: .2, roughness: .4 }); allMats.push(bulbMat);
  const strand = (a, b, n, sag) => {
    const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
    const curve = new T.CatmullRomCurve3(pts);
    root.add(new T.Mesh(new T.TubeGeometry(curve, 60, .012, 4, false), M("#2B3563")));
    for (let i = 1; i < n; i++) { const p = curve.getPoint(i / n); const s = new T.Mesh(new T.SphereGeometry(.065, 10, 8), bulbMat); s.position.copy(p).add(new T.Vector3(0, -.08, 0)); root.add(s); bulbs.push(s); }
  };
  strand(new T.Vector3(-6.5, 7.6, -6.5), new T.Vector3(6.6, 7.6, -6.5), 18, .7);
  strand(new T.Vector3(-6.5, 7.6, -6.5), new T.Vector3(-6.5, 7.6, 6.6), 18, .7);
  const stringLight = new T.PointLight(0xffb85c, 0, 14, 2); stringLight.position.set(-3, 6.6, -3); scene.add(stringLight);

  /* wall shelf + globe */
  const shelf = new T.Group();
  shelf.add(at(rbox(.9, .12, 2.6, .04, M("#FFFDF9")), 0, 0, 0));
  const globe = new T.Group(); globe.add(at(cyl(.12, .2, .1, "#2B3563"), 0, .11, 0));
  const gb = sph(.32, M("#AFC3E6", { roughness: .4, map: ctex(256, 128, (x, w, h) => { x.fillStyle = "#AFC3E6"; x.fillRect(0, 0, w, h); x.fillStyle = "#D6F04F"; [[40, 40, 30, 20], [70, 80, 18, 26], [130, 36, 40, 22], [160, 70, 30, 30], [210, 90, 22, 14]].forEach(([a, b, c, d]) => { x.beginPath(); x.ellipse(a, b, c, d, .3, 0, 7); x.fill(); }); }) }), 32);
  gb.material.map.encoding = T.sRGBEncoding; at(gb, 0, .52, 0); globe.add(gb); at(globe, 0, .06, -.6); shelf.add(globe);
  ["#E2434F", "#1C2342", "#D6F04F", "#F4EEE6"].forEach((c, i) => { const b = rbox(.5, .72 - (i % 2) * .1, .14, .02, M(c)); at(b, -.05, .42 - (i % 2) * .05, .35 + i * .16); b.rotation.x = i === 3 ? -.25 : 0; shelf.add(b); });
  shelf.rotation.y = -Math.PI / 2; at(shelf, -4.9, 6.25, -6.15); root.add(shelf);

  /* plant */
  const plant = new T.Group();
  plant.add(at(cyl(.62, .48, 1.2, M("#FFFDF9", { roughness: .5 })), 0, .6, 0), at(cyl(.635, .635, .18, M("#D6F04F")), 0, .95, 0));
  const leafMat = M("#5E9E6E", { roughness: .55, side: T.DoubleSide }), leafMat2 = M("#7DB884", { roughness: .55, side: T.DoubleSide });
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2, tilt = .35 + (i % 3) * .18, len = 1.5 + (i % 4) * .35;
    const stem = new T.Group(); stem.rotation.set(0, a, 0);
    const l = sph(.34, i % 2 ? leafMat : leafMat2, 16); l.scale.set(.55, len, .12); l.position.set(0, len * .9, 0);
    const arm = new T.Group(); arm.rotation.z = tilt; arm.add(l); stem.add(arm); stem.position.y = 1.1; plant.add(stem);
  }
  plant.scale.setScalar(.4); at(plant, -4.75, 2.725, -5.95); addIntro(plant, .7);

  /* desk */
  const DY = 2.725;
  const desk = new T.Group();
  // wider (left) and deeper (front) top, so writing, portfolio and a phone fit
  desk.add(at(rbox(9.4, .25, 3.6, .08, M("#C99A6B", { roughness: .55 })), -.4, 2.6, -4.75));
  desk.add(at(rbox(1.7, 2.47, 3.3, .08, M("#F3F1EE")), -4.1, 1.235, -4.8));
  [.6, 1.4, 2.1].forEach(y => desk.add(at(rbox(.5, .07, .07, .03, M("#2B3563")), -4.1, y, -3.13)));
  [-.6, 1.25].forEach(y => desk.add(at(new T.Mesh(new T.BoxGeometry(1.6, .02, .02), M("#d9d5cf")), -4.1, y + .4, -3.14)));
  [[3.95, -3.2], [3.95, -6.25]].forEach(([x, z]) => desk.add(at(rbox(.16, 2.5, .16, .05, M("#2B3563")), x, 1.25, z)));
  desk.add(at(rbox(.12, .12, 3.0, .04, M("#2B3563")), 3.95, .5, -4.72));
  shade(desk); addIntro(desk, .1);

  /* LAPTOP (WORK) */
  const laptop = new T.Group();
  const alu = M("#C9CED8", { metalness: .6, roughness: .32 });
  laptop.add(at(rbox(2.4, .09, 1.6, .04, alu), 0, .045, 0));
  laptop.add(at(new T.Mesh(new T.PlaneGeometry(2.1, .7), M("#2B3044")), 0, .092, -.25)); laptop.children[1].rotation.x = -Math.PI / 2;
  laptop.add(at(new T.Mesh(new T.PlaneGeometry(.8, .45), M("#B8BEC9", { metalness: .4, roughness: .3 })), 0, .092, .45)); laptop.children[2].rotation.x = -Math.PI / 2;
  const lid = new T.Group(); lid.position.set(0, .09, -.78);
  lid.add(at(rbox(2.4, 1.6, .07, .04, alu), 0, .8, 0));
  const screenTex = ctex(640, 420, DRAW.erhai);
  const screen = basicPlane(2.18, 1.4, screenTex); at(screen, 0, .82, .037); lid.add(screen);
  lid.rotation.x = -.3; laptop.add(lid);
  shade(laptop); laptop.rotation.y = .32; at(laptop, -1.6, DY, -5.0); addIntro(laptop, .35);

  /* BOOKS (JOURNEY) */
  const books = new T.Group();
  const bk = [["#2B3563", 1.6, .2, 1.15, .1], ["#D6F04F", 1.5, .22, 1.08, -.06], ["#E2434F", 1.45, .24, 1.05, .14]];
  let by = 0;
  bk.forEach(([c, w, h, d, r]) => { const g = new T.Group(); g.add(at(rbox(w, h, d, .03, M(c)), 0, 0, 0)); g.add(at(rbox(w - .06, h - .06, d - .02, .01, M("#FBF6EE")), .05, 0, 0)); g.rotation.y = r; at(g, 0, by + h / 2, 0); books.add(g); by += h; });
  const coverTex = ctex(300, 220, (x, w, h) => { x.fillStyle = "#E2434F"; x.fillRect(0, 0, w, h); x.fillStyle = "#FFFDF9"; x.font = "52px Gloock, serif";  x.font = "900 34px 'Noto Serif SC', serif"; x.fillText("故事书", 24, 160); x.fillStyle = "#D6F04F"; x.fillRect(24, 182, 70, 6); });
  const cover = plane(1.4, 1.0, coverTex, { roughness: .6 }); cover.rotation.x = -Math.PI / 2; cover.rotation.z = .14; at(cover, 0, by + .002, 0); books.add(cover);
  const pencil = new T.Group(); pencil.add(at(cyl(.035, .035, 1.1, M("#D6F04F"), 6), 0, 0, 0), at(new T.Mesh(new T.ConeGeometry(.035, .14, 6), M("#E9CFA6")), 0, .62, 0)); pencil.rotation.set(0, 0, Math.PI / 2); pencil.rotation.y = .5;
  at(pencil, .1, by + .04, .55); books.add(pencil);
  shade(books); at(books, 2.75, DY, -5.35); addIntro(books, .45);

  /* MUG with steam */
  const mug = new T.Group();
  mug.add(at(cyl(.22, .2, .44, M("#FFFDF9", { roughness: .35 })), 0, .22, 0), at(cyl(.2, .2, .02, M("#6B4128")), 0, .41, 0));
  const handle = new T.Mesh(new T.TorusGeometry(.12, .035, 8, 20, Math.PI), M("#FFFDF9")); handle.rotation.z = -Math.PI / 2; at(handle, .22, .23, 0); mug.add(handle);
  mug.add(at(cyl(.225, .205, .08, M("#E2434F")), 0, .18, 0));
  shade(mug); at(mug, -.35, DY, -3.75); addIntro(mug, .6);
  const steamTex = ctex(128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(255,255,255,.7)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const steams = [0, 1, 2].map(i => { const s = new T.Sprite(new T.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 })); s.userData.t = i / 3; mug.add(s); return s; });

  /* NOTEBOOKS (WRITING) */
  const notebk = new T.Group();
  let ny = 0;
  [["#AFC3E6", 1.15, .09, .82, -.08], ["#FFFDF9", 1.1, .14, .8, .1], ["#1C2342", 1.12, .08, .84, -.03]].forEach(([c, w, h, d, r]) => {
    const g = new T.Group(); g.add(at(rbox(w, h, d, .02, M(c, { roughness: .7 })), 0, 0, 0)); g.rotation.y = r; at(g, 0, ny + h / 2, 0); notebk.add(g); ny += h;
  });
  const notesTex = ctex(300, 220, (x, w, h) => {
    x.fillStyle = "#D6F04F"; x.fillRect(0, 0, w, h);
    x.font = "900 36px 'Noto Serif SC', serif"; x.fillText("便笺", 24, 152);
    x.fillStyle = "#E2434F"; x.fillRect(24, 176, 64, 6);
    x.strokeStyle = "rgba(28,35,66,.25)"; x.lineWidth = 2; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(190, 120 + i * 18); x.lineTo(276, 120 + i * 18); x.stroke(); }
  });
  const notesCover = plane(1.04, .76, notesTex, { roughness: .7 }); notesCover.rotation.x = -Math.PI / 2; notesCover.rotation.z = .03; at(notesCover, 0, ny + .002, 0); notebk.add(notesCover);
  const pen = new T.Group(); pen.add(at(cyl(.03, .03, .9, M("#E2434F"), 8), 0, 0, 0), at(cyl(.031, .031, .2, M("#D9B37A", { metalness: .8, roughness: .3 }), 8), 0, .4, 0));
  pen.rotation.set(0, -.6, Math.PI / 2); at(pen, .05, ny + .04, .3); notebk.add(pen);
  shade(notebk); notebk.rotation.y = .18; at(notebk, -4.3, DY, -5.0); addIntro(notebk, .5);

  /* PORTFOLIO FOLDER */
  const folio = new T.Group();
  folio.add(at(rbox(1.7, .08, 1.22, .03, M("#1C2342", { roughness: .45 })), 0, .04, 0));
  folio.add(at(rbox(1.62, .03, 1.16, .01, M("#FBF6EE")), .03, .095, .01));
  folio.add(at(rbox(1.72, .1, 1.24, .03, M("#232B54", { roughness: .45 })), 0, .14, 0));
  const folioTex = ctex(420, 300, (x, w, h) => {
    x.fillStyle = "#232B54"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#D6F04F"; x.font = "900 34px 'Noto Serif SC', serif"; x.fillText("文件夹", 32, 150);
    x.fillStyle = "#E2434F"; x.beginPath(); x.arc(360, 70, 26, 0, 7); x.fill();
  });
  const folioCover = plane(1.6, 1.14, folioTex, { roughness: .5 }); folioCover.rotation.x = -Math.PI / 2; at(folioCover, 0, .192, 0); folio.add(folioCover);
  folio.add(at(rbox(.08, .02, 1.26, .01, M("#D6F04F")), .58, .2, 0)); // elastic band
  shade(folio); folio.rotation.y = .22; at(folio, -3.75, DY, -3.62); addIntro(folio, .55);

  /* PHONE (SOCIAL ACCOUNTS) */
  const phone = new T.Group();
  phone.add(at(rbox(.52, .06, 1.0, .06, M("#1C2342", { roughness: .3, metalness: .3 })), 0, .03, 0));
  const phoneTex = ctex(260, 500, (x, w, h) => {
    x.fillStyle = "#F4EEE6"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#1C2342"; x.font = "600 22px 'Instrument Sans', sans-serif"; x.fillText("12:38", 22, 40);
    x.font = "900 30px 'Noto Serif SC', serif"; x.fillText("工具", 22, 104);
    [["#FF2442", "时钟", "#fff"], ["#2B3563", "相册", "#fff"], ["#D6F04F", "天气", "#1C2342"]].forEach(([c, t, f], i) => {
      const cx = 22 + (i % 2) * 114, cy = 140 + Math.floor(i / 2) * 150;
      x.fillStyle = c; x.beginPath(); x.roundRect ? x.roundRect(cx, cy, 100, 100, 24) : x.rect(cx, cy, 100, 100); x.fill();
      x.fillStyle = f; x.font = (t.length > 2 ? "700 20px" : "700 40px") + " 'Instrument Sans','Noto Sans SC',sans-serif"; x.textAlign = "center"; x.fillText(t, cx + 50, cy + (t.length > 2 ? 58 : 64)); x.textAlign = "left";
    });
    x.fillStyle = "rgba(28,35,66,.3)"; x.beginPath(); x.roundRect ? x.roundRect(80, 470, 100, 6, 3) : x.rect(80, 470, 100, 6); x.fill();
  });
  const phoneScreen = basicPlane(.46, .92, phoneTex); phoneScreen.rotation.x = -Math.PI / 2; at(phoneScreen, 0, .062, 0); phone.add(phoneScreen);
  shade(phone); phone.rotation.y = -.35; at(phone, 2.9, DY, -3.7); addIntro(phone, .6);

  /* DESK CLOCK (NYC / BJ) */
  const clock = new T.Group();
  clock.add(at(rbox(1.5, .82, .42, .18, M("#F3E6D2")), 0, .45, 0));
  clock.add(at(rbox(.2, .08, .3, .03, M("#2B3563")), -.5, .04, 0), at(rbox(.2, .08, .3, .03, M("#2B3563")), .5, .04, 0));
  const clockTex = ctex(600, 300, () => {});
  const drawClock = () => {
    const c = clockTex.userData.canvas, x = c.getContext("2d"), w = c.width, h = c.height;
    x.clearRect(0, 0, w, h); x.fillStyle = "#FFFDF9"; x.fillRect(0, 0, w, h);
    const now = new Date();
    [["America/New_York", "纽约", 150], ["Asia/Shanghai", "北京", 450]].forEach(([tz, lab, cx]) => {
      const p = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "numeric", hour12: false, timeZone: tz }).formatToParts(now);
      const hh = +p.find(q => q.type === "hour").value % 24, mm = +p.find(q => q.type === "minute").value;
      const night = hh < 7 || hh >= 19;
      x.fillStyle = night ? "#1C2342" : "#F4EEE6"; x.beginPath(); x.arc(cx, 128, 104, 0, 7); x.fill();
      x.strokeStyle = night ? "#D6F04F" : "#1C2342"; x.lineCap = "round";
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.lineWidth = i % 3 ? 3 : 6; x.beginPath(); x.moveTo(cx + Math.sin(a) * 84, 128 - Math.cos(a) * 84); x.lineTo(cx + Math.sin(a) * 96, 128 - Math.cos(a) * 96); x.stroke(); }
      const ha = ((hh % 12) + mm / 60) / 12 * Math.PI * 2, ma = mm / 60 * Math.PI * 2;
      x.strokeStyle = night ? "#FFFDF9" : "#1C2342"; x.lineWidth = 9; x.beginPath(); x.moveTo(cx, 128); x.lineTo(cx + Math.sin(ha) * 52, 128 - Math.cos(ha) * 52); x.stroke();
      x.lineWidth = 5; x.beginPath(); x.moveTo(cx, 128); x.lineTo(cx + Math.sin(ma) * 78, 128 - Math.cos(ma) * 78); x.stroke();
      x.fillStyle = "#E2434F"; x.beginPath(); x.arc(cx, 128, 9, 0, 7); x.fill();
      x.fillStyle = "#1C2342"; x.font = "600 30px 'Instrument Sans', sans-serif"; x.textAlign = "center";
      x.fillText(`${lab}  ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, cx, 284);
    });
    clockTex.needsUpdate = true;
  };
  drawClock(); setInterval(drawClock, 15000);
  const face = plane(1.3, .65, clockTex, { roughness: .4 }); at(face, 0, .47, .213); clock.add(face);
  shade(clock); clock.rotation.y = .2; at(clock, -3.55, DY, -6.0); addIntro(clock, .4);

  /* LAMP */
  const lamp = new T.Group();
  const lampMat = M("#E2434F", { roughness: .35 });
  lamp.add(at(cyl(.32, .36, .1, lampMat), 0, .05, 0));
  const arm1 = cyl(.035, .035, 1.5, M("#2B3563"), 10); arm1.rotation.z = .35; at(arm1, -.25, .78, 0); lamp.add(arm1);
  const arm2 = cyl(.035, .035, 1.2, M("#2B3563"), 10); arm2.rotation.z = -1.0; at(arm2, -.05, 1.75, 0); lamp.add(arm2);
  const head = new T.Group(); head.add(new T.Mesh(new T.ConeGeometry(.32, .45, 32, 1, true), new T.MeshStandardMaterial({ color: "#E2434F", side: T.DoubleSide, roughness: .35 })));
  const bulbM = new T.MeshStandardMaterial({ color: "#FFF4DA", emissive: new T.Color("#FFC56E"), emissiveIntensity: 0 }); allMats.push(bulbM, head.children[0].material);
  head.add(at(new T.Mesh(new T.SphereGeometry(.12, 16, 12), bulbM), 0, -.12, 0));
  head.rotation.z = -2.3; at(head, .45, 2.05, 0); lamp.add(head);
  const lampLight = new T.PointLight(0xffb764, 0, 7, 1.6); lampLight.position.set(.8, 1.7, .1); lamp.add(lampLight);
  shade(lamp); lamp.rotation.y = -1.9; at(lamp, 3.65, DY, -6.0); addIntro(lamp, .5);

  /* CABINET + TYPEWRITER (CONTACT) */
  const cab = new T.Group();
  cab.add(at(rbox(1.9, 2.2, 1.9, .1, M("#F3F1EE")), 0, 1.1, 0));
  [.65, 1.55].forEach(y => cab.add(at(rbox(.5, .07, .07, .03, M("#E2434F")), 0, y, .97)));
  cab.add(at(new T.Mesh(new T.BoxGeometry(1.7, .02, .02), M("#d9d5cf")), 0, 1.1, .955));
  shade(cab); at(cab, 5.55, 0, -5.45); addIntro(cab, .2);
  const tw = new T.Group();
  const twBlue = M("#8FAEDF", { roughness: .4 });
  tw.add(at(rbox(1.35, .34, 1.0, .12, twBlue), 0, .2, 0));
  const slope = rbox(1.25, .1, .55, .05, twBlue); slope.rotation.x = .35; at(slope, 0, .38, .1); tw.add(slope);
  const keyMat = M("#FFFDF9", { roughness: .3 }), keyMat2 = M("#1C2342", { roughness: .3 });
  for (let r = 0; r < 3; r++) for (let k = 0; k < 8 - r; k++) { const key = cyl(.045, .045, .05, (k + r) % 5 === 0 ? keyMat2 : keyMat, 12); at(key, -.5 + k * .14 + r * .07, .45 + r * .05, .26 - r * .14); tw.add(key); }
  const roller = cyl(.09, .09, 1.45, M("#1C2342", { roughness: .4 }), 20); roller.rotation.z = Math.PI / 2; at(roller, 0, .5, -.3); tw.add(roller);
  const paperTex = ctex(240, 220, (x, w, h) => { x.fillStyle = "#FFFDF9"; x.fillRect(0, 0, w, h); x.fillStyle = "#1C2342"; x.font = "700 26px 'Courier New', monospace"; x.fillText("晴天", 22, 56); x.fillStyle = "rgba(28,35,66,.35)"; [92, 124, 156].forEach((y, i) => x.fillRect(22, y, 190 - i * 40, 5)); x.fillStyle = "#E2434F"; x.font = "700 30px Caveat, cursive"; x.fillText("午后", 70, 200); });
  const paper = plane(.8, .74, paperTex, { side: T.DoubleSide, roughness: .9 }); paper.rotation.x = -.18; at(paper, 0, .88, -.38); tw.add(paper);
  shade(tw); tw.rotation.y = -.35; at(tw, 5.55, 2.2, -5.35); addIntro(tw, .65);

  /* PIANO (HOBBIES) */
  const piano = new T.Group();
  const ivory = new T.MeshPhysicalMaterial({ color: "#F1E8D8", roughness: .28, clearcoat: 1, clearcoatRoughness: .15 }); allMats.push(ivory);
  const goldP = M("#D9B37A", { metalness: .9, roughness: .25 });
  piano.add(at(rbox(2.6, .12, 1.0, .04, M("#2B3563")), 0, .06, 0));
  piano.add(at(rbox(2.6, 2.15, .72, .06, ivory), 0, 1.2, -.12));
  piano.add(at(rbox(2.7, .09, .84, .04, ivory), 0, 2.31, -.1));
  piano.add(at(rbox(2.6, .14, .5, .04, ivory), 0, 1.02, .4));
  [-1.24, 1.24].forEach(x => piano.add(at(rbox(.12, .5, .56, .04, ivory), x, 1.12, .38)));
  const wkM = M("#FFFDF9", { roughness: .3 }), bkM = M("#1C2342", { roughness: .3 });
  const NW = 22, kw = 2.34 / NW, pianoKeys = [];
  for (let i = 0; i < NW; i++) { const k = new T.Mesh(new T.BoxGeometry(kw * .92, .05, .4), wkM); at(k, -1.17 + kw * (i + .5), 1.115, .45); k.userData.y0 = 1.115; piano.add(k); pianoKeys.push(k); }
  for (let i = 0; i < NW - 1; i++) { const n = i % 7; if (n === 2 || n === 6) continue; const k = new T.Mesh(new T.BoxGeometry(kw * .55, .06, .24), bkM); at(k, -1.17 + kw * (i + 1), 1.15, .37); k.userData.y0 = 1.15; piano.add(k); pianoKeys.push(k); }
  const sheetTex = ctex(320, 200, (x, w, h) => {
    x.fillStyle = "#FFFDF9"; x.fillRect(0, 0, w, h); x.strokeStyle = "#1C2342"; x.lineWidth = 1.5;
    for (let st = 0; st < 2; st++) for (let l = 0; l < 5; l++) { const y = 46 + st * 82 + l * 9; x.beginPath(); x.moveTo(14, y); x.lineTo(w - 14, y); x.stroke(); }
    x.fillStyle = "#1C2342"; for (let i = 0; i < 12; i++) { const st = i % 2, y = 46 + st * 82 + ((i * 37) % 5) * 9 - 4, xx = 40 + (i >> 1) * 44 + st * 18; x.beginPath(); x.ellipse(xx, y + 4, 6, 4.5, -.4, 0, 7); x.fill(); x.fillRect(xx + 5, y - 24, 2, 28); }
    x.fillStyle = "#E2434F"; x.font = "700 24px Caveat, cursive"; x.fillText("前奏曲", w - 140, 26);
  });
  const sheetM = plane(1.0, .62, sheetTex, { roughness: .9 }); sheetM.rotation.x = -.18; at(sheetM, 0, 1.52, .27); piano.add(sheetM);
  piano.add(at(rbox(1.15, .06, .1, .02, ivory), 0, 1.2, .3));
  [-.25, 0, .25].forEach(x => piano.add(at(rbox(.1, .04, .2, .02, goldP), x, .16, .5)));
  const metro = new T.Group();
  const mBody = new T.Mesh(new T.ConeGeometry(.2, .5, 4), M("#E2434F", { roughness: .4 })); mBody.rotation.y = Math.PI / 4; at(mBody, 0, .25, 0); metro.add(mBody);
  const pend = new T.Group(); pend.position.set(0, .08, .12); pend.add(at(new T.Mesh(new T.BoxGeometry(.02, .38, .02), goldP), 0, .19, 0), at(new T.Mesh(new T.BoxGeometry(.07, .05, .03), goldP), 0, .26, 0)); metro.add(pend);
  at(metro, .85, 2.355, -.1); piano.add(metro);
  const vase = new T.Group(); vase.add(at(cyl(.1, .13, .3, M("#FFFDF9", { roughness: .3 })), 0, .15, 0));
  [["#E2434F", -.08, .52], ["#D6F04F", .07, .58], ["#F9C6CC", 0, .66]].forEach(([c, x, y]) => { vase.add(at(cyl(.008, .008, y - .2, M("#5E9E6E"), 6), x * .5, .2 + (y - .2) / 2, 0)); vase.add(at(sph(.07, M(c), 12), x, y, 0)); });
  at(vase, -.85, 2.355, -.1); piano.add(vase);
  shade(piano); piano.rotation.y = Math.PI / 2; at(piano, -6.05, 0, -2.2); addIntro(piano, .25);
  const bench = new T.Group();
  bench.add(at(rbox(1.3, .14, .5, .06, M("#1C2342", { roughness: .7 })), 0, .82, 0));
  [[-.55, -.18], [.55, -.18], [-.55, .18], [.55, .18]].forEach(([x, z]) => bench.add(at(cyl(.035, .035, .76, goldP, 10), x, .38, z)));
  shade(bench); bench.rotation.y = Math.PI / 2; at(bench, -4.95, 0, -2.2); addIntro(bench, .3);
  const noteTex = ["♪", "♫", "♩"].map((g, i) => ctex(128, 128, (x) => { x.fillStyle = i === 1 ? "#E2434F" : "#1C2342"; x.font = "96px Georgia, serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(g, 64, 70); }));
  const notes = Array.from({ length: 7 }, (_, i) => { const sp = new T.Sprite(new T.SpriteMaterial({ map: noteTex[i % 3], transparent: true, depthWrite: false, opacity: 0 })); sp.userData = { t: i / 7, ph: i * 1.3 }; root.add(sp); return sp; });
  let noteBurst = 0;
  onNote = (i) => { const k = pianoKeys[((i % pianoKeys.length) + pianoKeys.length) % pianoKeys.length]; k.userData.p = 1; noteBurst = 2.5; };

  /* TRAVEL BOARD (map + photos) */
  const tboard = new T.Group();
  tboard.add(at(rbox(.16, 2.7, 3.6, .06, M("#C79C6E")), 0, 0, 0));
  const landscape = plane(3.3, 2.4, ctex(770, 560, DRAW.erhai));
  landscape.rotation.y = Math.PI / 2;
  tboard.add(at(landscape, .09, 0, 0));
  at(tboard, -6.5, 4.95, -2.2); addIntro(tboard, .45);

  /* CHAIR + CAT */
  const chair = new T.Group();
  chair.add(at(rbox(1.55, .2, 1.5, .1, M("#1C2342", { roughness: .7 })), 0, 1.25, 0));
  chair.add(at(rbox(1.55, 1.3, .18, .09, M("#1C2342", { roughness: .7 })), 0, 2.0, .7));
  chair.add(at(cyl(.06, .06, 1.1, M("#C9CED8", { metalness: .7, roughness: .3 }), 12), 0, .6, 0));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const l = rbox(.7, .06, .1, .03, M("#C9CED8", { metalness: .7, roughness: .3 })); l.rotation.y = a; at(l, Math.cos(a) * .32, .08, -Math.sin(a) * .32); chair.add(l); }
  shade(chair); chair.rotation.y = -.55; at(chair, 2.4, 0, -1.9); addIntro(chair, .3);
  const cat = new T.Group();
  const fur = M("#F2A65A", { roughness: .85 }), furD = M("#D9843A", { roughness: .85 });
  const body = sph(.42, fur, 24); body.scale.set(1.15, .62, .9); at(body, 0, .26, 0); cat.add(body);
  const headC = sph(.26, fur, 24); at(headC, .42, .32, .18); cat.add(headC);
  [-1, 1].forEach(s => { const e = new T.Mesh(new T.ConeGeometry(.08, .16, 4), furD); at(e, .44 + s * .1, .56, .18); e.rotation.z = -s * .25; cat.add(e); });
  const tail = new T.Mesh(new T.TorusGeometry(.38, .06, 8, 24, Math.PI * 1.1), furD); tail.rotation.set(Math.PI / 2, 0, .5); at(tail, -.05, .12, 0); cat.add(tail);
  [-1, 1].forEach(s => { const eye = new T.Mesh(new T.BoxGeometry(.07, .012, .01), M("#1C2342")); at(eye, .52 + s * .02, .36, .42 - s * .0); eye.position.x = .44 + s * .09; eye.position.z = .43; cat.add(eye); });
  shade(cat); cat.rotation.y = -.3; at(cat, 2.35, 1.35, -1.95); addIntro(cat, .8);

  /* stickers */
  const sticker = (draw, w, h, x, y, z, ry = 0, rz = 0) => { const p = basicPlane(w, h, ctex(256, 256, draw), { transparent: true, toneMapped: true }); p.rotation.set(0, ry, rz); at(p, x, y, z); root.add(p); return p; };
  sticker((x) => { x.fillStyle = "#D6F04F"; x.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? 92 : 124; x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } x.fill(); x.fillStyle = "#1C2342"; x.font = "88px Caveat, cursive"; x.textAlign = "center"; x.fillText("晴", 128, 158); }, 1.0, 1.0, -3.0, 4.6, -6.58, 0, .2);
  sticker((x) => { x.fillStyle = "#E2434F"; x.beginPath(); x.moveTo(128, 214); x.bezierCurveTo(10, 130, 40, 30, 128, 80); x.bezierCurveTo(216, 30, 246, 130, 128, 214); x.fill(); }, .7, .7, 3.1, 6.6, -6.58, 0, -.2);

  /* dust */
  const dustN = 140, dGeo = new T.BufferGeometry(), dPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dPos[i * 3] = (Math.random() - .5) * 12; dPos[i * 3 + 1] = Math.random() * 7.5; dPos[i * 3 + 2] = (Math.random() - .5) * 12; }
  dGeo.setAttribute("position", new T.BufferAttribute(dPos, 3));
  const dust = new T.Points(dGeo, new T.PointsMaterial({ color: "#FFFFFF", size: .06, transparent: true, opacity: .6, depthWrite: false, map: steamTex }));
  root.add(dust);


  /* ---------- interactive items ---------- */
  const v3 = (x, y, z) => new T.Vector3(x, y, z);
  const ITEMS = {
    laptop: { obj: laptop, label: "电脑", anchor: v3(-1.5, DY + 2.65, -5.15), hit: [v3(2.6, 1.9, 2.0), v3(-1.6, DY + .9, -5.0)], view: { t: v3(-1.6, DY + .8, -5.0), r: 7.6, th: .42, ph: .26 }, lift: .12 },
    books: { obj: books, label: "书本", anchor: v3(2.75, DY + 1.05, -5.35), hit: [v3(1.9, .9, 1.5), v3(2.75, DY + .4, -5.35)], view: { t: v3(2.75, DY + .35, -5.35), r: 6.2, th: .78, ph: .52 }, lift: .14 },
    cork: { obj: cork, label: "留言板", anchor: v3(.2, 7.15, -6.4), hit: [v3(4.8, 3.0, .6), v3(.2, 5.5, -6.4)], view: { t: v3(.2, 5.45, -6.4), r: 10.5, th: .18, ph: .1 }, lift: 0, push: .12 },
    typewriter: { obj: tw, label: "打字机", anchor: v3(5.55, 3.55, -5.35), hit: [v3(1.6, 1.4, 1.4), v3(5.55, 2.85, -5.35)], view: { t: v3(5.55, 2.7, -5.35), r: 6.6, th: .82, ph: .34 }, lift: .12 },
    time: { obj: clock, hit: [v3(1.6, 1.0, .9), v3(-3.55, DY + .45, -6.0)], lift: .1, action: () => { toggleNight(true); goSpot("time", true); setTimeout(() => meSay(night ? "天黑啦，开灯～" : "天亮啦！"), 300); } },
    notebook: { obj: notebk, hit: [v3(1.5, .9, 1.2), v3(-4.3, DY + .3, -5.0)], view: { t: v3(-4.0, DY + .3, -4.6), r: 6.4, th: .45, ph: .62 }, lift: .14 },
    folder: { obj: folio, hit: [v3(1.9, .6, 1.4), v3(-3.75, DY + .15, -3.62)], view: { t: v3(-3.6, DY + .2, -3.9), r: 6.4, th: .35, ph: .7 }, lift: .12 },
    phone: { obj: phone, hit: [v3(1.0, .5, 1.3), v3(2.9, DY + .1, -3.7)], view: { t: v3(2.9, DY + .1, -3.9), r: 5.6, th: .15, ph: .75 }, lift: .12 },
    lamp: { obj: lamp, label: "台灯", anchor: v3(3.8, DY + 2.7, -6), hit: [v3(1.2, 2.4, 1.2), v3(3.8, DY + 1.2, -6.0)], lift: .06, action: () => { lampOn = !lampOn; completeTask("lamp"); } },
    cat: { obj: cat, label: "猫咪", anchor: v3(2.35, 2.1, -1.95), hit: [v3(1.2, .8, 1.1), v3(2.35, 1.7, -1.95)], lift: 0, action: () => { poke(); goSpot("cat"); completeTask("cat"); } },
    piano: { obj: piano, label: "钢琴", anchor: v3(-5.75, 3.0, -2.2), hit: [v3(1.5, 2.6, 2.9), v3(-5.9, 1.25, -2.2)], view: { t: v3(-5.6, 1.75, -2.2), r: 8.2, th: 1.2, ph: .25 }, lift: 0 },
    painting: { obj: tboard, label: "风景画", anchor: v3(-6.4, 6.5, -2.2), hit: [v3(.6, 2.8, 3.8), v3(-6.4, 4.95, -2.2)], view: { t: v3(-6.4, 4.95, -2.2), r: 9.6, th: 1.3, ph: .1 }, lift: 0, pushX: .14 },
    window: { obj: win, hit: [v3(.6, 3.3, 4.3), v3(-6.55, 4.6, 2.9)], view: { t: v3(-6.55, 4.6, 2.9), r: 9, th: 1.5, ph: .17 } },
    globe: { obj: globe, hit: [v3(1, 1.1, 1), v3(-4.3, 6.8, -6.15)], lift: 0, action: () => { globeSpin = 6; goSpot("cork", true); } }
  };
  const hitMat = new T.MeshBasicMaterial({ visible: false });
  const hits = [];
  for (const [id, it] of Object.entries(ITEMS)) {
    const m = new T.Mesh(new T.BoxGeometry(it.hit[0].x, it.hit[0].y, it.hit[0].z), hitMat);
    m.position.copy(it.hit[1]); m.userData.id = id; scene.add(m); hits.push(m);
    it.base = it.obj.position.clone(); it.h = 0;
    if (it.label) {
      const b = document.createElement("button"); b.className = "tag"; b.textContent = it.label;
      b.addEventListener("click", () => it.action ? it.action() : go(id));
      b.addEventListener("mouseenter", () => hoverId = id); b.addEventListener("mouseleave", () => hoverId = null);
      $("#labels").appendChild(b); it.tag = b;
    }
  }

  /* ---------- the owner's 3D chibi avatar (fallback, drawn after the 3D model: wavy auburn bob, flower crown, sage floral dress, white cardigan) ---------- */
  function buildAvatar() {
    const grad = new T.DataTexture(new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 242, 242, 242, 255]), 3, 1, T.RGBAFormat);
    grad.minFilter = grad.magFilter = T.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
    const TM = (c, o = {}) => { const m = new T.MeshToonMaterial(Object.assign({ color: c, gradientMap: grad }, o)); allMats.push(m); return m; };
    const mesh = (g, m) => { const x = new T.Mesh(g, m); x.castShadow = true; x.receiveShadow = true; return x; };
    const skin = TM("#F6DDD2");
    // hair: soft strands + a glossy "angel ring" highlight so it doesn't read as a solid helmet
    const hairTex = ctex(256, 256, (x, w, h) => { x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const px = (i * 37.7) % w; x.strokeStyle = i % 3 ? "rgba(120,80,75,.28)" : "rgba(255,255,255,.35)"; x.lineWidth = 1.5 + (i % 4); x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + 12, h * .35, px - 12, h * .65, px + 4, h); x.stroke(); }
      const g = x.createLinearGradient(0, h * .18, 0, h * .34); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(.5, "rgba(255,225,215,.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, h * .18, w, h * .16); });
    hairTex.wrapS = T.RepeatWrapping; hairTex.repeat.set(3, 1);
    const hairM = TM("#4A2826", { side: T.DoubleSide, map: hairTex }), hairM2 = TM("#5A322F", { map: hairTex }), hairM3 = TM("#3A1F1E");
    const root = new T.Group(), body = new T.Group(); root.add(body);
    // tiny-flower print used on the dress
    const floral = (base, dots, n) => (x, w, h) => { x.fillStyle = base; x.fillRect(0, 0, w, h);
      for (let i = 0; i < n; i++) { const px = (i * 73.3) % w, py = (i * 41.7 + (i % 7) * 13) % h, c = dots[i % dots.length];
        x.fillStyle = c; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; x.beginPath(); x.arc(px + Math.cos(a) * 3.4, py + Math.sin(a) * 3.4, 2.4, 0, 7); x.fill(); }
        x.fillStyle = "#F2D27A"; x.beginPath(); x.arc(px, py, 1.4, 0, 7); x.fill(); } };
    // legs + white shoes
    const shoeM = TM("#FBF8F3");
    const legs = [-1, 1].map(sd => {
      const hip = new T.Group(); hip.position.set(sd * .11, .48, 0);
      hip.add(at(mesh(new T.CylinderGeometry(.06, .055, .36, 14), skin), 0, -.19, 0));
      const shoe = mesh(geoRBox(.16, .11, .27, .055), shoeM); shoe.position.set(0, -.42, .04); hip.add(shoe);
      body.add(hip); return hip;
    });
    // sage patchwork skirt: diagonal bands of three floral prints
    const skirtTex = ctex(512, 256, (x, w, h) => {
      const bands = [["#8FA586", ["#FFFFFF", "#F4F1E4"]], ["#EEF0E2", ["#7E9A76", "#A9BFA0"]], ["#6F8A68", ["#FFFFFF", "#E9EFE2"]]];
      const pat = bands.map(([b, d]) => { const c = document.createElement("canvas"); c.width = c.height = 128; floral(b, d, 60)(c.getContext("2d"), 128, 128); return x.createPattern(c, "repeat"); });
      x.save(); x.translate(w / 2, h / 2); x.rotate(-.5);
      for (let b = -8; b < 8; b++) { x.fillStyle = pat[(b + 9) % 3]; x.fillRect(-w, b * 46, w * 2, 46); x.fillStyle = "rgba(255,255,255,.75)"; x.fillRect(-w, b * 46, w * 2, 2.5); }
      x.restore();
    });
    skirtTex.wrapS = T.RepeatWrapping; skirtTex.repeat.set(2, 1);
    const skirt = mesh(new T.CylinderGeometry(.27, .52, .74, 48, 1, true), TM("#ffffff", { map: skirtTex, side: T.DoubleSide })); skirt.position.y = .79; body.add(skirt);
    const hem = mesh(new T.TorusGeometry(.52, .016, 6, 64), TM("#F4F1E4")); hem.rotation.x = Math.PI / 2; hem.position.y = .425; body.add(hem);
    // camisole bodice with a lace band under the bust and thin straps
    const bodTex = ctex(256, 128, floral("#93AA8B", ["#FFFFFF", "#F1EEDC"], 70));
    body.add(at(mesh(new T.CylinderGeometry(.215, .27, .29, 32), TM("#ffffff", { map: bodTex })), 0, 1.275, 0));
    const lace = mesh(new T.TorusGeometry(.272, .03, 8, 48), TM("#FFFDF6")); lace.rotation.x = Math.PI / 2; lace.position.y = 1.15; body.add(lace);
    const neckline = mesh(new T.TorusGeometry(.218, .018, 6, 40), TM("#FFFDF6")); neckline.rotation.x = Math.PI / 2; neckline.position.y = 1.415; body.add(neckline);
    [-1, 1].forEach(sd => body.add(at(mesh(new T.CylinderGeometry(.012, .012, .12, 6), TM("#93AA8B")), sd * .12, 1.47, .03)));
    const sh = mesh(new T.SphereGeometry(.24, 24, 16), skin); sh.scale.set(1.15, .36, .8); sh.position.y = 1.42; body.add(sh);
    body.add(at(mesh(new T.CylinderGeometry(.068, .072, .16, 12), skin), 0, 1.5, 0));
    // long white cardigan, open at the front, down to the hem
    const knitTex = ctex(256, 256, (x, w, h) => { x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h); x.strokeStyle = "rgba(225,222,216,.9)"; x.lineWidth = 2; for (let xx = 4; xx < w; xx += 9) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, h); x.stroke(); } });
    knitTex.wrapS = knitTex.wrapT = T.RepeatWrapping; knitTex.repeat.set(6, 2);
    const cardM = TM("#FFFFFF", { map: knitTex, side: T.DoubleSide });
    const card = mesh(new T.CylinderGeometry(.3, .5, 1.04, 48, 1, true, .78, Math.PI * 2 - 1.56), cardM); card.position.y = .9; body.add(card);
    [-1, 1].forEach(sd => { const pl = mesh(new T.BoxGeometry(.05, 1.0, .025), cardM); const a = sd * .78; pl.position.set(Math.sin(a) * .41, .9, Math.cos(a) * .41); pl.rotation.set(-.21, a, sd * -.19); body.add(pl); });
    // arms in long cardigan sleeves with soft cuffs
    const arms = [-1, 1].map(sd => {
      const sp = new T.Group(); sp.position.set(sd * .33, 1.4, 0); sp.rotation.z = sd * .28;
      const puff = mesh(new T.SphereGeometry(.105, 16, 12), cardM); puff.scale.set(1, 1.1, 1); puff.position.y = -.04; sp.add(puff);
      sp.add(at(mesh(new T.CylinderGeometry(.085, .1, .44, 14), cardM), 0, -.27, 0));
      sp.add(at(mesh(new T.TorusGeometry(.095, .022, 6, 20), cardM), 0, -.48, 0).rotateX(Math.PI / 2));
      sp.add(at(mesh(new T.SphereGeometry(.06, 14, 12), skin), 0, -.54, 0));
      body.add(sp); return sp;
    });
    // head
    const head = new T.Group(); head.position.y = 1.98; body.add(head);
    head.add(mesh(new T.SphereGeometry(.5, 48, 32), skin));
    // big glossy grey eyes with sparkle highlights, red lower liner, tiny mouth
    const drawFace = (closed) => (x, w, h) => {
      x.clearRect(0, 0, w, h);
      [-1, 1].forEach(sd => {
        x.save(); const ex = w / 2 + sd * 98, ey = 292; x.translate(ex, ey); x.scale(1.14, 1.14); x.translate(-ex, -ey);
        const g = x.createRadialGradient(ex + sd * 30, ey + 74, 2, ex + sd * 30, ey + 74, 52); g.addColorStop(0, "rgba(255,150,165,.55)"); g.addColorStop(1, "rgba(255,150,165,0)");
        x.fillStyle = g; x.beginPath(); x.ellipse(ex + sd * 30, ey + 74, 54, 30, 0, 0, 7); x.fill();
        x.strokeStyle = "#8A5A4C"; x.lineWidth = 5; x.lineCap = "round"; x.beginPath(); x.moveTo(ex - 26, ey - 92); x.quadraticCurveTo(ex, ey - 102, ex + 26, ey - 94); x.stroke();
        if (closed) { x.strokeStyle = "#2A1A18"; x.lineWidth = 9; x.beginPath(); x.moveTo(ex - 42, ey + 4); x.quadraticCurveTo(ex, ey + 30, ex + 42, ey + 4); x.stroke();
          x.strokeStyle = "#D9485A"; x.lineWidth = 4; x.beginPath(); x.moveTo(ex + sd * 40, ey + 6); x.lineTo(ex + sd * 52, ey); x.stroke(); x.restore(); return; }
        x.fillStyle = "#FFFFFF"; x.beginPath(); x.ellipse(ex, ey + 4, 50, 56, 0, 0, 7); x.fill();
        const ig = x.createLinearGradient(0, ey - 50, 0, ey + 56); ig.addColorStop(0, "#5E5566"); ig.addColorStop(.5, "#A79DB0"); ig.addColorStop(1, "#E7E1EC");
        x.fillStyle = ig; x.beginPath(); x.ellipse(ex, ey + 6, 41, 50, 0, 0, 7); x.fill();
        x.strokeStyle = "#3D3443"; x.lineWidth = 3; x.stroke();
        x.fillStyle = "#2C2430"; x.beginPath(); x.ellipse(ex, ey + 2, 17, 22, 0, 0, 7); x.fill();
        // star sparkle + round highlights
        const star = (cx, cy, r) => { x.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, rr = k % 2 ? r * .32 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); };
        x.fillStyle = "#fff"; star(ex - 12, ey - 14, 20); x.beginPath(); x.arc(ex + 18, ey + 26, 7, 0, 7); x.fill(); x.beginPath(); x.arc(ex - 16, ey + 30, 3.5, 0, 7); x.fill();
        // upper lash line + wing
        x.strokeStyle = "#241818"; x.lineWidth = 10; x.beginPath(); x.moveTo(ex - 52, ey - 6); x.quadraticCurveTo(ex, ey - 70, ex + 52, ey - 6); x.stroke();
        x.lineWidth = 5; x.beginPath(); x.moveTo(ex + sd * 50, ey - 8); x.quadraticCurveTo(ex + sd * 62, ey - 14, ex + sd * 66, ey - 26); x.stroke();
        // red lower liner
        x.strokeStyle = "#D9485A"; x.lineWidth = 4; x.beginPath(); x.moveTo(ex - 40, ey + 50); x.quadraticCurveTo(ex, ey + 66, ex + 40, ey + 50); x.stroke();
        x.beginPath(); x.moveTo(ex + sd * 46, ey + 40); x.lineTo(ex + sd * 60, ey + 30); x.stroke();
        x.restore();
      });
      x.fillStyle = "rgba(214,140,128,.6)"; x.beginPath(); x.ellipse(w / 2, 362, 4, 3, 0, 0, 7); x.fill();
      x.strokeStyle = "#B24A57"; x.lineWidth = 4; x.lineCap = "round"; x.beginPath(); x.moveTo(w / 2 - 11, 404); x.quadraticCurveTo(w / 2, 410, w / 2 + 11, 404); x.stroke();
    };
    const faceOpen = ctex(512, 512, drawFace(false)), faceClosed = ctex(512, 512, drawFace(true));
    const faceM = new T.MeshToonMaterial({ map: faceOpen, gradientMap: grad, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }); allMats.push(faceM);
    head.add(new T.Mesh(new T.SphereGeometry(.503, 48, 32, Math.PI / 2 - .9, 1.8, 1.0, 1.3), faceM));
    [-1, 1].forEach(sd => { const e = mesh(new T.SphereGeometry(.085, 12, 10), skin); e.scale.set(.5, 1, .8); e.position.set(sd * .49, -.04, 0); head.add(e); });
    // auburn wavy bob: crown, side-parted bangs, voluminous waves that flip out at the shoulders
    const bob = [[.0, .59], [.27, .555], [.45, .43], [.545, .22], [.57, 0], [.575, -.2], [.6, -.36], [.64, -.47], [.66, -.55], [.6, -.6], [.5, -.56]].map(p => new T.Vector2(p[0], p[1]));
    head.add(mesh(new T.LatheGeometry(bob, 64, .82, Math.PI * 2 - 1.64), hairM));
    head.add(mesh(new T.SphereGeometry(.552, 48, 20, 0, Math.PI * 2, 0, .95), hairM));
    const bangs = [[.0, .59], [.28, .555], [.45, .43], [.53, .3], [.545, .24]].map(p => new T.Vector2(p[0], p[1]));
    head.add(mesh(new T.LatheGeometry(bangs, 40, -.95, 1.9), hairM));
    for (let i = 0; i < 5; i++) { // side-swept fringe: big soft locks curving toward her left
      const a = -.7 + i * .33, lk = mesh(new T.SphereGeometry(.14, 18, 14), i === 2 ? hairM2 : hairM);
      lk.position.set(Math.sin(a) * .535, .25 - i * .025, Math.cos(a) * .535); lk.rotation.set(-.35, a, .75); lk.scale.set(.75, 1.25, .28); head.add(lk);
    }
    [-1, 1].forEach(sd => { // soft waves down each side, flaring out at the shoulders
      [[.52, -.08, .1, .2, 0], [.58, -.33, .07, .22, 1], [.66, -.56, .04, .2, 0]].forEach(([px, py, pz, r, alt]) => {
        const w = mesh(new T.SphereGeometry(r, 20, 16), alt ? hairM2 : hairM);
        w.position.set(sd * px, py, pz); w.scale.set(.58, 1, .85); w.rotation.z = sd * (alt ? -.35 : .2); head.add(w);
      });
      const flip = mesh(new T.TorusGeometry(.09, .05, 8, 18, Math.PI * 1.2), hairM3); flip.position.set(sd * .74, -.72, .05); flip.rotation.set(0, sd * .5, sd > 0 ? .2 : 2.9); head.add(flip);
      const back = mesh(new T.SphereGeometry(.24, 18, 14), hairM); back.position.set(sd * .34, -.48, -.28); back.scale.set(1, .95, .8); head.add(back);
    });
    for (let i = 0; i < 6; i++) { // rounded waves across the back so it never looks like a bucket from behind
      const a = Math.PI + (i - 2.5) * .42, r = .5;
      const w = mesh(new T.SphereGeometry(.2, 18, 14), i % 2 ? hairM2 : hairM);
      w.position.set(Math.sin(a) * r, -.38 - (i % 2) * .1, Math.cos(a) * r); w.scale.set(.85, 1.1, .6); w.rotation.y = a; head.add(w);
    }
    // chunky flower crown: white, peach, butter-yellow and pink blooms with leaves
    const crown = new T.Group(); crown.position.set(0, .34, -.04); crown.rotation.x = -.3; head.add(crown);
    const ring = mesh(new T.TorusGeometry(.55, .03, 8, 56), TM("#5E9A4A")); ring.rotation.x = Math.PI / 2; crown.add(ring);
    const FC = ["#FFFFFF", "#FFC98A", "#FFE7A3", "#F7C9D9", "#FFFFFF", "#FFB8A0"], leafM = TM("#6DAE4F"), leafM2 = TM("#4F8E3C"), centerM = TM("#F2B63D");
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * Math.PI * 2, p = new T.Vector3(Math.sin(a) * .56, 0, Math.cos(a) * .56);
      if (i % 2) { const lf = mesh(new T.SphereGeometry(.07, 10, 8), i % 4 === 1 ? leafM : leafM2); lf.position.copy(p).add(new T.Vector3(0, .03, 0)); lf.scale.set(.55, .3, 1.4); lf.rotation.set(.4, a + .9, .3); crown.add(lf); continue; }
      const fl = new T.Group(); fl.position.copy(p); fl.lookAt(p.clone().multiplyScalar(2).add(new T.Vector3(0, .7, 0)));
      const front = Math.cos(a) > -.2, s = front ? 1.25 : 1, pm = TM(FC[(i / 2) % FC.length]);
      for (let k = 0; k < 5; k++) { const pa = k / 5 * Math.PI * 2, pt = mesh(new T.SphereGeometry(.06 * s, 10, 8), pm); pt.position.set(Math.cos(pa) * .058 * s, Math.sin(pa) * .058 * s, 0); pt.scale.set(1, 1, .45); fl.add(pt); }
      fl.add(at(mesh(new T.SphereGeometry(.03 * s, 8, 6), centerM), 0, 0, .03)); crown.add(fl);
    }
    // daisy earrings
    [-1, 1].forEach(sd => {
      const er = new T.Group(); er.position.set(sd * .5, -.33, .17); er.rotation.y = sd * .35; er.scale.setScalar(1.2);
      er.add(at(mesh(new T.SphereGeometry(.022, 8, 6), TM("#FFFDF9")), 0, .085, 0));
      for (let k = 0; k < 9; k++) { const pa = k / 9 * Math.PI * 2, pt = mesh(new T.SphereGeometry(.032, 8, 6), TM("#FFFDF9")); pt.position.set(Math.cos(pa) * .05, Math.sin(pa) * .05, 0); pt.scale.set(1.3, .6, .4); pt.rotation.z = pa; er.add(pt); }
      er.add(at(mesh(new T.SphereGeometry(.028, 8, 6), TM("#FFD34D")), 0, 0, .015)); head.add(er);
    });
    return { root, body, head, legs, arms, skirt, faceM, faceOpen, faceClosed };
  }

  /* ---------- ME: the owner's 3D avatar ---------- */
  const me = new T.Group(); me.visible = false; root.add(me);
  const A = buildAvatar(); me.add(A.root); A.root.visible = false; // 代码画的小人只在模型真的加载失败时出现
  // Tripo model of the owner (avatar.json = glTF, published next to the page); the code-built chibi stays as fallback
  const MODEL_H = 2.75, MODEL_YAW = 0; // the Meshy model faces +Z
  const GLB = { ok: false, pivot: new T.Group(), model: null };
  me.add(GLB.pivot);
  // small self-contained glTF reader for avatar.json (one mesh, embedded buffer + textures) — no CDN loader needed
  // self-contained glTF reader for avatar.json: node tree, skinned mesh, skeleton, animation clips (no CDN loader needed)
  // 部分国内网络访问 vercel.app 时连接会被随机断开：每个文件失败后自动重试几次
  const fetchRetry = async (u, tries = 5) => {
    for (let k = 0; ; k++) {
      try { const r = await fetch(u, { cache: k ? "reload" : "default" }); if (!r.ok) throw new Error(u + " " + r.status); return r; }
      catch (e) { if (k >= tries - 1) throw e; await new Promise(ok => setTimeout(ok, 600 * (k + 1))); }
    }
  };
  async function loadAvatarModel(url) {
    // 双击打开（file://）时浏览器禁止 fetch 本地文件，改用 <script> 读取内嵌版数据
    let j = null;
    // 1) 模型数据已经内嵌在页面末尾：只要网页打开了，模型就在，不再依赖额外下载
    const inl = document.getElementById("avatar-data");
    if (inl) { try { j = JSON.parse(inl.textContent); } catch (e) { j = null; } inl.remove(); }
    // 2) 备用：单独的 avatar.json / avatar-embed.js
    if (j) {}
    else if (location.protocol === "file:") { await loadScript(url.replace(/\.json$/, "-embed.js"), 60000); j = window.__AVATAR_EMBED; if (!j) throw new Error("avatar-embed.js missing"); }
    else { j = await (await fetchRetry(url)).json(); }
    const b64 = (s) => { const bin = atob(s.slice(s.indexOf(",") + 1)); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    const bu = j.buffers[0].uri, buf = bu.startsWith("data:") ? b64(bu) : await (await fetchRetry(new URL(bu, new URL(url, location.href)))).arrayBuffer();
    const TA = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const arr = (i) => { const a = j.accessors[i], v = j.bufferViews[a.bufferView]; return new TA[a.componentType](buf, (v.byteOffset || 0) + (a.byteOffset || 0), a.count * NC[a.type]); };
    const attr = (i) => { const a = j.accessors[i]; return new T.BufferAttribute(arr(i), NC[a.type], !!a.normalized); };
    const san = (n) => String(n || "").replace(/[\[\]\.:\/\s]/g, "_");
    // the exported mesh is flat-shaded (every face has its own normals): rebuild smooth normals,
    // averaging faces that share a position and lie within ~70° so real creases stay crisp
    const smoothNormals = (g) => {
      const P = g.attributes.position.array, ix = g.index ? g.index.array : null, nv = P.length / 3, nt = ix ? ix.length / 3 : nv / 3;
      const vi = (t, k) => ix ? ix[t * 3 + k] : t * 3 + k;
      const fN = new Float32Array(nt * 3), own = new Float32Array(nv * 3), groups = new Map(), keyOf = new Array(nv);
      for (let v = 0; v < nv; v++) { const k = Math.round(P[v * 3] * 2e4) + "," + Math.round(P[v * 3 + 1] * 2e4) + "," + Math.round(P[v * 3 + 2] * 2e4); keyOf[v] = k; }
      for (let t = 0; t < nt; t++) {
        const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);
        const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
        const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        fN[t * 3] = nx; fN[t * 3 + 1] = ny; fN[t * 3 + 2] = nz;
        for (const v of [a, b, c]) { own[v * 3] += nx; own[v * 3 + 1] += ny; own[v * 3 + 2] += nz; let gr = groups.get(keyOf[v]); if (!gr) groups.set(keyOf[v], gr = []); gr.push(t); }
      }
      const out = new Float32Array(nv * 3), cosT = Math.cos(70 * Math.PI / 180);
      for (let v = 0; v < nv; v++) {
        let ox = own[v * 3], oy = own[v * 3 + 1], oz = own[v * 3 + 2]; const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
        let sx = 0, sy = 0, sz = 0;
        for (const t of groups.get(keyOf[v])) { const nx = fN[t * 3], ny = fN[t * 3 + 1], nz = fN[t * 3 + 2], l = Math.hypot(nx, ny, nz) || 1; if ((nx * ox + ny * oy + nz * oz) / l >= cosT) { sx += nx; sy += ny; sz += nz; } }
        const sl = Math.hypot(sx, sy, sz) || 1; out[v * 3] = sx / sl; out[v * 3 + 1] = sy / sl; out[v * 3 + 2] = sz / sl;
      }
      g.setAttribute("normal", new T.BufferAttribute(out, 3));
    };
    // material
    const tl = new T.TextureLoader();
    const tex = (ref, srgb) => ref === undefined ? Promise.resolve(null) : new Promise((ok, fail) => {
      const src = j.images[j.textures[ref.index].source].uri;
      const t = new T.Texture(); t.flipY = false; if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = 8;
      let k = 0;
      const tryLoad = () => { const img = new Image(); img.crossOrigin = "anonymous";
        img.onload = () => { t.image = img; t.needsUpdate = true; ok(t); };
        img.onerror = () => { if (++k >= 5) return fail(new Error("texture " + src)); setTimeout(tryLoad, 600 * k); };
        img.src = src.startsWith("data:") || k === 0 ? src : src + (src.includes("?") ? "&" : "?") + "r=" + k; };
      tryLoad();
    });
    const md = (j.materials || [])[0] || {}, pbr = md.pbrMetallicRoughness || {};
    const [map, mr, nm] = await Promise.all([tex(pbr.baseColorTexture, true), tex(pbr.metallicRoughnessTexture), tex(md.normalTexture)]);
    const mat = new T.MeshStandardMaterial({ map, roughnessMap: mr, metalnessMap: mr, normalMap: nm, roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? 1, side: md.doubleSided ? T.DoubleSide : T.FrontSide });
    if (pbr.baseColorFactor) mat.color.setRGB(pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2]);
    if (nm) mat.normalScale.set(.55, -.55);
    // nodes
    const joints = new Set((j.skins || []).flatMap(sk => sk.joints));
    const objs = j.nodes.map((n, i) => {
      let o;
      if (n.mesh !== undefined) {
        const pr = j.meshes[n.mesh].primitives[0], at2 = pr.attributes, g = new T.BufferGeometry();
        g.setAttribute("position", attr(at2.POSITION));
        if (at2.NORMAL !== undefined) g.setAttribute("normal", attr(at2.NORMAL)); else g.computeVertexNormals();
        if (at2.TEXCOORD_0 !== undefined) g.setAttribute("uv", attr(at2.TEXCOORD_0));
        if (at2.JOINTS_0 !== undefined) g.setAttribute("skinIndex", attr(at2.JOINTS_0));
        if (at2.WEIGHTS_0 !== undefined) g.setAttribute("skinWeight", attr(at2.WEIGHTS_0));
        if (pr.indices !== undefined) g.setIndex(attr(pr.indices));
        smoothNormals(g);
        o = n.skin !== undefined ? new T.SkinnedMesh(g, mat) : new T.Mesh(g, mat);
        o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
      } else o = joints.has(i) ? new T.Bone() : new T.Group();
      o.name = san(n.name) || "node" + i;
      if (n.matrix) new T.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
      else { if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); }
      return o;
    });
    j.nodes.forEach((n, i) => (n.children || []).forEach(c => objs[i].add(objs[c])));
    const root = new T.Group(); j.scenes[j.scene || 0].nodes.forEach(i => root.add(objs[i]));
    root.updateMatrixWorld(true);
    j.nodes.forEach((n, i) => {
      if (n.skin === undefined) return;
      const sk = j.skins[n.skin], ibm = sk.inverseBindMatrices !== undefined ? arr(sk.inverseBindMatrices) : null;
      const bones = sk.joints.map(k => objs[k]), inv = sk.joints.map((k, q) => ibm ? new T.Matrix4().fromArray(ibm, q * 16) : new T.Matrix4());
      objs[i].bind(new T.Skeleton(bones, inv), objs[i].matrixWorld);
    });
    const clips = (j.animations || []).map(an => {
      const tracks = [];
      an.channels.forEach(c => {
        const sm = an.samplers[c.sampler], times = arr(sm.input), vals = arr(sm.output), nmv = objs[c.target.node].name, path = c.target.path;
        if (path === "rotation") tracks.push(new T.QuaternionKeyframeTrack(nmv + ".quaternion", times, vals));
        else if (path === "translation") tracks.push(new T.VectorKeyframeTrack(nmv + ".position", times, vals));
        else if (path === "scale") tracks.push(new T.VectorKeyframeTrack(nmv + ".scale", times, vals));
      });
      return new T.AnimationClip(an.name, -1, tracks);
    });
    const wrap = new T.Group(); wrap.add(root); root.rotation.y = MODEL_YAW; wrap.userData.clips = clips;
    return wrap;
  }
  loadAvatarModel("avatar.json").then((m) => {
    m.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(m), size = box.getSize(new T.Vector3());
    const k = MODEL_H / Math.max(size.y, 1e-3); m.scale.setScalar(k);
    const c = box.getCenter(new T.Vector3()); m.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; allMats.push(o.material); } });
    const clips = m.userData.clips || [];
    if (clips.length) {
      GLB.mixer = new T.AnimationMixer(m);
      const act = (...names) => { for (const n of names) { const cl = clips.find(x => x.name === n); if (cl) { const a = GLB.mixer.clipAction(cl); a.play(); a.setEffectiveWeight(0); return a; } } return null; };
      // idle = the rig's rest pose (hands down, feet together) + breathing; walk / cheer / dance blend over it
      GLB.acts = { walk: act("Walking_Woman", "Walking"), cheer: act("Cheer_with_Both_Hands"), dance: act("Hip_Hop_Dance") };
      GLB.w = { walk: 0, act: 0 }; GLB.cur = "cheer";
      GLB.spine = m.getObjectByName("mixamorig_Spine1"); GLB.head = m.getObjectByName("mixamorig_Head");
    }
    GLB.model = m; GLB.pivot.add(m); GLB.ok = true; A.root.visible = false;
  }).catch((err) => { console.warn("avatar model failed, using the code-built avatar", err); A.root.visible = true; });
  const ME_H = 2.75; let blinkT = 3, yaw = 0;
  const meShadow = basicPlane(1.3, 1.3, blob.material.map, { transparent: true, depthWrite: false, opacity: 1 }); meShadow.rotation.x = -Math.PI / 2; meShadow.position.y = .03; me.add(meShadow);
  const meHit = new T.Mesh(new T.BoxGeometry(1.0, 2.7, 1.0), hitMat); meHit.userData.id = "me"; scene.add(meHit); hits.push(meHit);
  trees.forEach((tr, i) => { const h = new T.Mesh(new T.BoxGeometry(3.2 * tr.s, 5 * tr.s, 3.2 * tr.s), hitMat); h.position.set(tr.x, 2.6 * tr.s, tr.z); h.userData.id = "tree" + i; scene.add(h); hits.push(h); });
  const ripple = new T.Mesh(new T.RingGeometry(.22, .3, 40), new T.MeshBasicMaterial({ color: "#E2434F", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  ripple.rotation.x = -Math.PI / 2; ripple.position.y = .04; root.add(ripple);
  const ME = { pos: new T.Vector3(6.3, 0, 5.8), head: new T.Vector3(-1, 0, -.5).normalize(), path: [], face: null, speed: 0, phase: 0, idleT: 0, holdT: 0, hop: 0, view: "front", viewT: 0, say: "", sayT: 0, arriveSay: null, rip: 0 };
  // walkable grid (A*) around the furniture
  const G = { x0: -6.4, z0: -6.4, s: .5, n: 44 }, INF = .42;
  const RECTS = [[-5.15, 4.35, -6.6, -2.9], [4.6, 6.5, -6.4, -4.5], [-6.6, -5.3, -3.55, -.85], [-5.3, -4.65, -2.9, -1.5], [1.65, 3.15, -2.65, -1.15]];
  const inIsland = (x, z) => Math.hypot(x - ISL.x, z - ISL.z) < ISL.r - 1.0;
  const blockedXZ = (x, z) => (x < -6.25 && z <= 6.9) || (z < -6.25 && x <= 6.9) || !((x <= 6.7 && z <= 6.7) || inIsland(x, z)) || trees.some(t => Math.hypot(x - t.x, z - t.z) < .55 * t.s + INF) || RECTS.some(r => x > r[0] - INF && x < r[1] + INF && z > r[2] - INF && z < r[3] + INF);
  const cellC = (i, j) => [G.x0 + i * G.s, G.z0 + j * G.s];
  const free = []; for (let i = 0; i < G.n; i++) { free[i] = []; for (let j = 0; j < G.n; j++) { const c = cellC(i, j); free[i][j] = !blockedXZ(c[0], c[1]); } }
  const toCell = (x, z) => [Math.max(0, Math.min(G.n - 1, Math.round((x - G.x0) / G.s))), Math.max(0, Math.min(G.n - 1, Math.round((z - G.z0) / G.s)))];
  function nearestFree(i, j) { if (free[i][j]) return [i, j]; for (let r = 1; r < G.n; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < G.n && b < G.n && free[a][b]) return [a, b]; } return [i, j]; }
  const los = (ax, az, bx, bz) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / .15); for (let k = 1; k <= n; k++) { const t = k / n; if (blockedXZ(ax + (bx - ax) * t, az + (bz - az) * t)) return false; } return true; };
  function findPath(sx, sz, tx, tz) {
    if (!blockedXZ(tx, tz) && los(sx, sz, tx, tz)) return [new T.Vector3(tx, 0, tz)];
    const [si, sj] = nearestFree(...toCell(sx, sz)), [ti, tj] = nearestFree(...toCell(tx, tz));
    const key = (i, j) => i * G.n + j, open = new Map(), g = new Map(), came = new Map(), closed = new Set();
    const h = (i, j) => Math.hypot(i - ti, j - tj);
    g.set(key(si, sj), 0); open.set(key(si, sj), h(si, sj));
    while (open.size) {
      let bk = null, bf = Infinity; open.forEach((f, k) => { if (f < bf) { bf = f; bk = k; } });
      open.delete(bk); closed.add(bk);
      const ci = Math.floor(bk / G.n), cj = bk % G.n;
      if (ci === ti && cj === tj) break;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue; const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= G.n || nj >= G.n || !free[ni][nj]) continue;
        if (di && dj && (!free[ci + di][cj] || !free[ci][cj + dj])) continue;
        const nk = key(ni, nj); if (closed.has(nk)) continue;
        const ng = g.get(bk) + Math.hypot(di, dj);
        if (ng < (g.has(nk) ? g.get(nk) : Infinity)) { g.set(nk, ng); came.set(nk, bk); open.set(nk, ng + h(ni, nj)); }
      }
    }
    const tk = key(ti, tj), sk = key(si, sj);
    if (tk !== sk && !came.has(tk)) return [];
    const cells = []; let k = tk; while (k !== undefined) { cells.unshift(k); k = came.get(k); }
    const pts = cells.map(c => cellC(Math.floor(c / G.n), c % G.n));
    if (!blockedXZ(tx, tz)) pts.push([tx, tz]);
    const out = []; let ax = sx, az = sz, idx = 0;
    while (idx < pts.length) { let far = idx; for (let m = pts.length - 1; m > idx; m--) if (los(ax, az, pts[m][0], pts[m][1])) { far = m; break; } out.push(new T.Vector3(pts[far][0], 0, pts[far][1])); ax = pts[far][0]; az = pts[far][1]; idx = far + 1; }
    return out;
  }
  const abub = $("#abub");
  function meSay(t, dur = 3.4) { ME.say = t; ME.sayT = dur; abub.textContent = t; }
  function walkTo(x, z, face, say) { ME.onArrive = null; if (RIDE.state === "walking") RIDE.state = "idle"; ME.path = findPath(ME.pos.x, ME.pos.z, x, z); ME.face = face ? new T.Vector3(face[0], 0, face[1]).normalize() : null; ME.arriveSay = say || null; ME.idleT = 0; if (!ME.path.length) { if (ME.face) { ME.head.copy(ME.face); ME.holdT = 5; } if (say) meSay(say); } }
  const SPOTS = {
    laptop: [-1.6, -2.45, 0, -1, "屏幕上是湖边的夕阳。"],
    books: [3.95, -2.45, 0, -1, "找本书看看吧。"],
    cork: [-.4, -2.45, 0, -1, "这里钉着几张明信片。"],
    typewriter: [5.5, -3.6, 0, -1, "咔哒，打好了一行字。"],
    painting: [-3.6, 1, -1, -.3, "看，湖面上有倒影。"],
    piano: [-4.4, 0, -1, -.6, "听听这个和弦。"],
    time: [-3, -2.45, 0, -1, null],
    notebook: [-4.3, -2.4, 0, -1, "翻开新的一页。"],
    folder: [-3.4, -2.4, 0, -1, null],
    phone: [3, -2.4, 0, -1, null],
    window: [-5.6, 2.9, -1, 0, "窗外是纽约的天际线"], cat: [2.4, -.4, 0, -1, "摸摸猫猫～"],
    center: [2.2, .6, 0, 1, null], rug: [.6, 1.2, 0, 1, null], corner: [4.8, 1.2, 0, 1, null], east: [5.6, -1.6, 0, 1, null], beach: [9.4, 4.4, .6, 1, "海风好舒服～"], sakura: [8.2, -2.4, 1, -.8, "樱花开啦～"], shore: [12.6, .2, 1, 0, null]
  };
  const goSpot = (id, quiet) => { const sp = SPOTS[id]; if (sp) walkTo(sp[0], sp[1], [sp[2], sp[3]], quiet ? null : sp[4]); };
  const GREET = ["你好呀！", "一起走走吧。", "去听听钢琴？"];
  let greetI = 0;
  const faceCam = () => { ME.head.set(camera.position.x - ME.pos.x, 0, camera.position.z - ME.pos.z).normalize(); };
  function pokeMe() { ME.hop = 1; ME.wave = 2.2; if (GLB.acts) { GLB.cur = (greetI % 3 === 2 && GLB.acts.dance) ? "dance" : "cheer"; const ac = GLB.acts[GLB.cur]; if (ac) { ac.time = 0; ME.dance = ac.getClip().duration; } } ME.path = []; ME.face = null; faceCam(); ME.holdT = 6; meSay(GREET[greetI++ % GREET.length]); focusMe(); }
  function focusMe() {
    focus = "me"; 
    goal.t.set(ME.pos.x, 1.5, ME.pos.z); goal.r = isPhone() ? 8.5 : 6.6;
    goal.th = Math.atan2(camera.position.x - ME.pos.x, camera.position.z - ME.pos.z); goal.ph = .2; userTh = userPh = userR = 0;
    $("#hint").classList.add("away"); $("#labels").classList.add("away");
  }

  /* ---------- ride the rubber duck around the island ---------- */
  const RIDE = { state: "idle", t: 0, from: new T.Vector3(), to: new T.Vector3(), said: 0 };
  const duckHit = new T.Mesh(new T.BoxGeometry(3.4, 3.2, 4.8), hitMat); duckHit.userData.id = "duck"; scene.add(duckHit); hits.push(duckHit);
  const duckTag = document.createElement("button"); duckTag.className = "tag"; duckTag.textContent = "骑鸭";
  duckTag.addEventListener("click", () => startRide()); duckTag.addEventListener("mouseenter", () => hoverId = "duck"); duckTag.addEventListener("mouseleave", () => hoverId = null);
  $("#labels").appendChild(duckTag);
  const shoreOf = (a) => new T.Vector3(ISL.x + Math.cos(a) * (ISL.r - 1.6), 0, ISL.z + Math.sin(a) * (ISL.r - 1.6));
  const seatWorld = () => duck.localToWorld(DUCK.seat.clone());
  function rideCam(on) {
    if (on) { focus = "duck"; $("#hint").classList.add("away"); $("#labels").classList.add("away"); goal.r = isPhone() ? 30 : 22; goal.ph = .42; userTh = userPh = userR = 0; }
    else { cur.th = HOME.th + Math.atan2(Math.sin(cur.th - HOME.th), Math.cos(cur.th - HOME.th)); go("home"); }
  }
  function startRide() {
    if (!me.visible) return;
    if (RIDE.state === "riding") { meSay(randomLine(["抓紧啦～", "冲呀！", "风好大～"])); return; }
    if (RIDE.state !== "idle") return;
    if (focus && focus !== "duck") go("home");
    const sp = shoreOf(DUCK.a0); walkTo(sp.x, sp.z, [Math.cos(DUCK.a0), Math.sin(DUCK.a0)]);
    RIDE.state = "walking"; meSay("我去骑大黄鸭啦！", 2.5);
    ME.onArrive = () => { RIDE.state = "boarding"; RIDE.t = 0; RIDE.from.set(ME.pos.x, 0, ME.pos.z); rideCam(true); };
    if (!ME.path.length) { const f = ME.onArrive; ME.onArrive = null; f(); }
  }
  function updateRide(dt) {
    // duck: bob on the waves, sail while riding
    const R0 = RIDE.state;
    if (R0 === "riding") { DUCK.a += dt * .3; if (DUCK.a - DUCK.a0 >= Math.PI * 2) { DUCK.a = DUCK.a0; RIDE.state = "landing"; RIDE.t = 0; RIDE.to.copy(shoreOf(DUCK.a0)); meSay("靠岸啦～下次再来！", 3); } }
    duckPlace(DUCK.a);
    duckBody.position.y = Math.sin(time * 1.6) * .07; duckBody.rotation.z = Math.sin(time * 1.25) * .045; duckBody.rotation.x = Math.sin(time * 1.05 + 1) * .03 + (R0 === "riding" ? -.04 : 0);
    duckHit.position.set(duck.position.x, duck.position.y + 1.8, duck.position.z); duckHit.rotation.y = duck.rotation.y;
    // wake
    wakeTimer -= dt;
    if (R0 === "riding" && wakeTimer <= 0) { wakeTimer = .16; const w = wakes[wakeI++ % wakes.length], back = new T.Vector3(0, 0, -2.2).applyQuaternion(duck.quaternion); w.position.set(duck.position.x + back.x, -.6, duck.position.z + back.z); w.userData.t = 0; }
    wakes.forEach(w => { if (w.userData.t < 1) { w.userData.t = Math.min(1, w.userData.t + dt * .7); w.scale.setScalar(1 + w.userData.t * 2.5); w.material.opacity = (1 - w.userData.t) * .55; } else w.material.opacity = 0; });
    // avatar on the duck
    if (R0 === "boarding" || R0 === "landing") {
      RIDE.t = Math.min(1, RIDE.t + dt / .75);
      const st = seatWorld(), a = R0 === "boarding" ? RIDE.from : st, b = R0 === "boarding" ? st : RIDE.to, e = RIDE.t;
      ME.pos.set(a.x + (b.x - a.x) * e, 0, a.z + (b.z - a.z) * e); ME.y = a.y + (b.y - a.y) * e + Math.sin(e * Math.PI) * 1.4;
      ME.head.set(b.x - a.x, 0, b.z - a.z).normalize(); ME.path = []; ME.speed = 0;
      if (RIDE.t >= 1) {
        if (R0 === "boarding") { RIDE.state = "riding"; RIDE.said = 0; meSay("坐大黄鸭出海咯～", 3); }
        else { RIDE.state = "idle"; ME.y = 0; ME.idleT = 0; rideCam(false); }
      }
    } else if (R0 === "riding") {
      const st = seatWorld(); ME.pos.set(st.x, 0, st.z); ME.y = st.y; ME.path = []; ME.speed = 0;
      ME.head.set(0, 0, 1).applyQuaternion(duck.quaternion); ME.head.y = 0; ME.head.normalize();
      const prog = (DUCK.a - DUCK.a0) / (Math.PI * 2);
      if (prog > .33 && RIDE.said < 1) { RIDE.said = 1; meSay("海风好舒服～", 3); }
      if (prog > .66 && RIDE.said < 2) { RIDE.said = 2; meSay("樱花从这边看更好看！", 3); }
      goal.t.set(duck.position.x, 1.6, duck.position.z);
      const tg = Math.atan2(duck.position.x - ISL.x, duck.position.z - ISL.z); goal.th = cur.th + Math.atan2(Math.sin(tg - cur.th), Math.cos(tg - cur.th));
    }
    // follow tag above the docked duck
    const showTag = R0 === "idle" && !focus;
    duckTag.style.visibility = showTag ? "visible" : "hidden";
    if (showTag) { tmpV.set(duck.position.x, duck.position.y + 3.4, duck.position.z).project(camera); duckTag.style.translate = `${(tmpV.x * .5 + .5) * innerWidth}px ${(-tmpV.y * .5 + .5) * innerHeight}px`; if (tmpV.z > 1) duckTag.style.visibility = "hidden"; }
    duckTag.classList.toggle("on", hoverId === "duck");
  }
  const floorPlane = new T.Plane(new T.Vector3(0, 1, 0), 0), floorHit = new T.Vector3();
  function floorPoint() { if (!ray.ray.intersectPlane(floorPlane, floorHit)) return null; return Math.hypot(floorHit.x - ISL.x, floorHit.z - ISL.z) < ISL.r + 8 ? floorHit : null; }
  const meKeys = {};
  addEventListener("keydown", e => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) return; const k = e.key.toLowerCase(); if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { meKeys[k] = true; e.preventDefault(); } });
  addEventListener("keyup", e => { meKeys[e.key.toLowerCase()] = false; });
  addEventListener("blur", () => { for (const k in meKeys) meKeys[k] = false; });
  const tmpF = new T.Vector3(), tmpR = new T.Vector3(), camDir = new T.Vector3(), WHITE = new T.Color("#ffffff"), NIGHT_TINT = new T.Color("#7F8AC4");
  const WANDER = innerWidth > 720 ? ["center", "rug", "cat", "corner", "east", "beach", "sakura", "shore", "books"] : ["center", "rug", "cat", "corner", "painting", "piano"];
  function updateMe(dt) {
    if (!me.visible) return;
    let mvx = 0, mvz = 0;
    const lockK = RIDE.state !== "idle" && RIDE.state !== "walking";
    const kf = lockK ? 0 : (meKeys.w || meKeys.arrowup ? 1 : 0) - (meKeys.s || meKeys.arrowdown ? 1 : 0), kr = lockK ? 0 : (meKeys.d || meKeys.arrowright ? 1 : 0) - (meKeys.a || meKeys.arrowleft ? 1 : 0);
    if (kf || kr) {
      camera.getWorldDirection(tmpF); tmpF.y = 0; tmpF.normalize(); tmpR.set(-tmpF.z, 0, tmpF.x);
      mvx = tmpF.x * kf + tmpR.x * kr; mvz = tmpF.z * kf + tmpR.z * kr; const l = Math.hypot(mvx, mvz); mvx /= l; mvz /= l;
      ME.path = []; ME.face = null; ME.idleT = 0; ME.holdT = 0;
    } else if (ME.path.length) {
      const tg = ME.path[0], dx = tg.x - ME.pos.x, dz = tg.z - ME.pos.z, d = Math.hypot(dx, dz);
      if (d <= Math.max(.06, ME.speed * dt * 1.2)) {
        ME.pos.x = tg.x; ME.pos.z = tg.z; ME.path.shift();
        if (!ME.path.length) { if (ME.onArrive) { const f = ME.onArrive; ME.onArrive = null; f(); } if (ME.face) { ME.head.copy(ME.face); ME.holdT = 5; } if (ME.arriveSay) { meSay(ME.arriveSay); ME.arriveSay = null; } ME.idleT = 0; }
      } else { mvx = dx / d; mvz = dz / d; }
    }
    const moving = !!(mvx || mvz);
    ME.speed = damp(ME.speed, moving ? 2.5 : 0, 9, dt);
    if (moving) {
      const sp = Math.max(ME.speed, .6), nx = ME.pos.x + mvx * sp * dt, nz = ME.pos.z + mvz * sp * dt;
      if (ME.path.length || !blockedXZ(nx, nz)) { ME.pos.x = nx; ME.pos.z = nz; }
      else if (!blockedXZ(nx, ME.pos.z)) ME.pos.x = nx; else if (!blockedXZ(ME.pos.x, nz)) ME.pos.z = nz;
      ME.head.set(mvx, 0, mvz); ME.phase += sp * dt * 4.4;
    } else {
      ME.idleT += dt; ME.holdT -= dt;
      if (ME.holdT <= 0 && ME.idleT > 2.5 && !focus) faceCam();
      if (!focus && RIDE.state === "idle" && ME.idleT > 10 && ME.sayT <= 0) { ME.idleT = -Math.random() * 6; goSpot(WANDER[Math.floor(Math.random() * WANDER.length)], Math.random() > .3); }
    }
    if (GLB.ok) {
      // toy-like walk for the static model: waddle, bounce, lean; spin on poke
      const tY = Math.atan2(ME.head.x, ME.head.z);
      let d2 = tY - yaw; d2 = Math.atan2(Math.sin(d2), Math.cos(d2)); yaw += d2 * (1 - Math.exp(-10 * dt));
      const wk = Math.min(1, ME.speed / 1.5), sw2 = Math.sin(ME.phase);
      if (ME.hop > 0) ME.hop = Math.max(0, ME.hop - dt * 1.8);
      const hop2 = ME.hop > 0 ? Math.sin((1 - ME.hop) * Math.PI) * .35 : 0;
      const breath = Math.sin(time * 2.2) * .015 * (1 - wk);
      if (GLB.mixer) {
        // real skeletal animation: rest pose when idle, walk while moving, cheer / dance when poked
        GLB.pivot.rotation.set(0, yaw, 0); GLB.pivot.position.y = 0;
        ME.dance = Math.max(0, (ME.dance || 0) - dt);
        const on = ME.dance > 0 ? 1 : 0, W = GLB.w;
        W.act = damp(W.act, on, 7, dt); W.walk = damp(W.walk, wk, 8, dt);
        const A2 = GLB.acts, other = GLB.cur === "cheer" ? "dance" : "cheer";
        if (A2.walk) { A2.walk.setEffectiveWeight(W.walk * (1 - W.act)); A2.walk.timeScale = Math.max(.7, Math.min(1.5, ME.speed / 2.2)); }
        if (A2[GLB.cur]) A2[GLB.cur].setEffectiveWeight(W.act);
        if (A2[other]) A2[other].setEffectiveWeight(0);
        GLB.mixer.update(dt);
        const still = (1 - W.walk) * (1 - W.act);
        if (GLB.spine && still > .01) GLB.spine.rotation.x += Math.sin(time * 1.6) * .012 * still;
      } else {
        GLB.pivot.rotation.set(.045 * wk, yaw + Math.sin(ME.phase * .5) * .04 * wk, sw2 * .035 * wk);
        GLB.pivot.position.y = Math.abs(Math.cos(ME.phase)) * .07 * wk + hop2;
      }
      const sq = ME.hop > .92 ? .9 : 1;
      if (!GLB.mixer) GLB.pivot.scale.set(1 - breath * .6 + (1 - sq) * .4, (1 + breath) * sq, 1 - breath * .6 + (1 - sq) * .4);
      const bob = GLB.pivot.position.y - hop2, hopY = hop2;
      me.position.set(ME.pos.x, ME.y || 0, ME.pos.z); meShadow.visible = !(ME.y > .05);
      meShadow.scale.setScalar(1 - (bob + hopY) * .4);
      meHit.position.set(ME.pos.x, 1.35 + hopY + (ME.y || 0), ME.pos.z);
      if (ME.rip > 0) { ME.rip = Math.max(0, ME.rip - dt * 1.6); ripple.scale.setScalar(1 + (1 - ME.rip) * 2.2); ripple.material.opacity = ME.rip * .8; }
      ME.sayT -= dt;
      const showName2 = hoverId === "me" && ME.sayT <= 0;
      if (ME.sayT > 0 || showName2) {
        if (showName2) abub.textContent = "点我打招呼";
        tmpV.set(ME.pos.x, ME_H + .45 + hopY + bob + (ME.y || 0), ME.pos.z).project(camera);
        abub.style.transform = `translate(${(tmpV.x * .5 + .5) * innerWidth}px, ${(-tmpV.y * .5 + .5) * innerHeight}px) translate(-50%,-100%)`;
        abub.classList.add("show");
      } else abub.classList.remove("show");
      return;
    }
    // 3D rig: turn toward heading, swing legs/arms while walking
    const tYaw = Math.atan2(ME.head.x, ME.head.z);
    let dy = tYaw - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); yaw += dy * (1 - Math.exp(-10 * dt)); A.root.rotation.y = yaw;
    const walkAmt = Math.min(1, ME.speed / 1.5), sw = Math.sin(ME.phase);
    const bob = Math.abs(Math.cos(ME.phase)) * .07 * walkAmt;
    if (ME.hop > 0) ME.hop = Math.max(0, ME.hop - dt * 2.2);
    const hopY = ME.hop > 0 ? Math.sin((1 - ME.hop) * Math.PI) * .6 : 0;
    const br = Math.sin(time * 2.1) * .012 * (1 - walkAmt);
    A.body.position.y = bob + hopY; A.body.scale.set(1 - br * .5, 1 + br, 1 - br * .5);
    A.legs[0].rotation.x = sw * .6 * walkAmt; A.legs[1].rotation.x = -sw * .6 * walkAmt;
    A.arms[0].rotation.x = -sw * .5 * walkAmt; A.arms[1].rotation.x = sw * .5 * walkAmt;
    ME.wave = Math.max(0, (ME.wave || 0) - dt);
    A.arms[0].rotation.z = ME.wave > 0 ? -2.5 + Math.sin(time * 14) * .35 : -.28 - (1 - walkAmt) * Math.sin(time * 1.3) * .03;
    A.arms[1].rotation.z = .28 + (1 - walkAmt) * Math.sin(time * 1.3) * .03;
    A.skirt.rotation.z = sw * .05 * walkAmt; A.skirt.scale.set(1 + walkAmt * .02, 1, 1 + walkAmt * .02);
    A.head.rotation.z = sw * .05 * walkAmt + Math.sin(time * .9) * .05 * (1 - walkAmt);
    A.head.rotation.x = ME.wave > 0 ? -.08 : Math.sin(time * .7) * .03;
    blinkT -= dt; if (blinkT < 0) { A.faceM.map = A.faceClosed; if (blinkT < -.13) { A.faceM.map = A.faceOpen; blinkT = 2.5 + Math.random() * 3; } }
    me.position.set(ME.pos.x, ME.y || 0, ME.pos.z); meShadow.visible = !(ME.y > .05);
    meShadow.scale.setScalar(1 - (bob + hopY) * .4);
    meHit.position.set(ME.pos.x, 1.35 + hopY + (ME.y || 0), ME.pos.z);
    // ripple feedback on floor clicks
    if (ME.rip > 0) { ME.rip = Math.max(0, ME.rip - dt * 1.6); ripple.scale.setScalar(1 + (1 - ME.rip) * 2.2); ripple.material.opacity = ME.rip * .8; }
    // speech bubble
    ME.sayT -= dt;
    const showName = hoverId === "me" && ME.sayT <= 0;
    if (ME.sayT > 0 || showName) {
      if (showName) abub.textContent = "点我打招呼";
      tmpV.set(ME.pos.x, ME_H + .45 + hopY + bob + (ME.y || 0), ME.pos.z).project(camera);
      abub.style.transform = `translate(${(tmpV.x * .5 + .5) * innerWidth}px, ${(-tmpV.y * .5 + .5) * innerHeight}px) translate(-50%,-100%)`;
      abub.classList.add("show");
    } else abub.classList.remove("show");
  }

  /* ---------- camera rig ---------- */
  const HOME = { t: v3(2.6, 1.9, -1.8), th: .64, ph: .5 };
  const aspect = () => (innerWidth > 1 && innerHeight > 1 ? innerWidth / innerHeight : 1.6);
  const homeR = () => { const a = aspect(); return a >= 1 ? Math.max(33, 45 / a) : 28 + 18 / a; };
  const cur = { t: HOME.t.clone(), r: homeR() + 14, th: HOME.th + .5, ph: HOME.ph + .25 };
  const goal = { t: HOME.t.clone(), r: homeR(), th: HOME.th, ph: HOME.ph };
  let focus = null, drag = null, userTh = 0, userPh = 0, userR = 0, hoverId = null, mouse = { x: 0, y: 0 };
  let lastW = 0, lastH = 0;
  const setFov = () => { camera.fov = aspect() < 1 ? 40 : 30; camera.aspect = aspect(); camera.updateProjectionMatrix(); };
  setFov();

  function go(id) {
    hoverId = null; document.body.classList.remove("hovering");
    if (id !== "home" && (RIDE.state === "boarding" || RIDE.state === "riding" || RIDE.state === "landing")) { toast("骑完这一圈再去哦～"); return; }
    if (id === "home" || !ITEMS[id] || !ITEMS[id].view) {
      focus = null; 
      goal.t.copy(HOME.t); goal.r = homeR(); goal.th = HOME.th; goal.ph = HOME.ph; userTh = userPh = userR = 0;
      $("#hint").classList.remove("away"); $("#labels").classList.remove("away");
      return;
    }
    const v = ITEMS[id].view; focus = id; goSpot(id);
    goal.t.copy(v.t); goal.r = v.r * (isPhone() ? 1.25 : 1); goal.th = v.th; goal.ph = v.ph; userTh = userPh = userR = 0;
    $("#hint").classList.add("away"); $("#labels").classList.add("away");
    if (id === "piano") { playArp(); completeTask(id); }
  };

  $("#home").onclick = () => go("home");
  addEventListener("keydown", event => { if (event.key === "Escape" && focus) go("home"); });

  /* ---------- input ---------- */
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  function pick(cx, cy) { ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const r = ray.intersectObjects(hits, false); return r.length ? r[0].object.userData.id : null; }
  canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, th: userTh, ph: userPh, moved: false, id: e.pointerId }; });
  addEventListener("pointermove", e => {
    // 鼠标在气泡上时不再跟着鼠标转镜头，气泡就不会“躲”着鼠标跑
    const onTag = e.target && e.target.closest && e.target.closest(".tag");
    if (!onTag) { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; }
    if (drag && drag.id === e.pointerId) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) { drag.moved = true; document.body.classList.add("dragging"); }
      if (drag.moved) { userTh = Math.max(-.55, Math.min(.55, drag.th - dx * .004)); userPh = Math.max(-.3, Math.min(.35, drag.ph + dy * .003)); }
      return;
    }
    if (e.target === canvas && e.pointerType !== "touch") { const id = pick(e.clientX, e.clientY); hoverId = id; document.body.classList.toggle("hovering", !!id); }
  });
  addEventListener("pointerup", e => {
    if (!drag || drag.id !== e.pointerId) return;
    const wasDrag = drag.moved; drag = null; document.body.classList.remove("dragging");
    if (wasDrag || e.target !== canvas) return;
    const id = pick(e.clientX, e.clientY);
    const riding = RIDE.state === "boarding" || RIDE.state === "riding" || RIDE.state === "landing";
    if (id === "duck") { startRide(); return; }
    if (riding) { if (id === "me") meSay(randomLine(["抓紧啦～", "风好大～", "看，樱花！"])); return; }
    if (id === "me") { pokeMe(); return; }
    if (id && id.startsWith("tree")) { const ti = +id.slice(4), tr = trees[ti]; tr.shake = 1; burstPetals(ti); walkTo(tr.x - 1.6, tr.z + 1.4, [1, -.7], ["樱花开啦～", "风里都是花香", "花瓣落在头发上啦"][Math.floor(Math.random() * 3)]); return; }
    if (id) { const it = ITEMS[id]; it.h = Math.max(it.h, .6); if (it.action) it.action(); else go(id); }
    else if (focus) go("home");
    else { const fp = floorPoint(); if (fp) { const onLand = (fp.x <= 6.7 && fp.z <= 6.7) || inIsland(fp.x, fp.z); walkTo(fp.x, fp.z, null, onLand ? null : "海风好舒服～"); ripple.position.set(fp.x, onLand ? .04 : -.58, fp.z); ME.rip = 1; } }
  });
  canvas.addEventListener("wheel", e => { if (!e.ctrlKey) return; e.preventDefault(); userR = Math.max(-8, Math.min(10, userR + e.deltaY * .02)); }, { passive: false });
  addEventListener("resize", () => { window.__topbarH = 0; renderer.setSize(innerWidth, innerHeight, false); setFov(); if (!focus) goal.r = homeR(); });

  /* ---------- day / night ---------- */
  const hourNow = new Date().getHours();
  let night = hourNow >= 19 || hourNow < 6, nightT = night ? 1 : 0, lampOn = night, globeSpin = 0;
  const applyNightUI = () => { document.body.classList.toggle("night", night); $("#daynight").textContent = night ? "☾" : "☀︎"; };
  function toggleNight(fromClock) {
    night = !night; lampOn = night; applyNightUI();
    if (fromClock) toast(`纽约 ${fmtTime("America/New_York")} · 北京 ${fmtTime("Asia/Shanghai")}  —  已切换到${night ? "夜晚" : "白天"}`);
  }
  applyNightUI();
  $("#daynight").onclick = () => toggleNight(false);

  /* ---------- cat easter egg ---------- */
  const bubble = $("#bubble"); let catHop = 0, bubbleT = 0;
  const MEOWS = ["喵～", "别吵，我在开会", "呼噜……", "摸摸头？", "喵！今天也辛苦啦"];
  let meowI = 0;
  function poke() { catHop = 1; bubble.textContent = MEOWS[meowI++ % MEOWS.length]; bubbleT = 2.2; }

  /* ---------- intro drop-in ---------- */
  intro.forEach(o => { o.item = Object.values(ITEMS).some(it => it.obj === o.g); o.g.userData.drop = 9; o.g.visible = false; });
  let introStart = -1;
  const easeOutBack = t => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  /* ---------- loop ---------- */
  const clockT = new T.Clock(); let time = 0;
  const tmpV = new T.Vector3(), sunDay = new T.Color(0xfff1de), sunNight = new T.Color(0x8fa0ff);
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

  let diagShown = false;
  function frame() {
    requestAnimationFrame(frame);
    try { step(); } catch (e) { if (!diagShown) { diagShown = true; console.error(e); toast("3D 场景有点小状况，刷新一下试试～"); } }
  }
  function step() {
    const dt = Math.min(clockT.getDelta(), .05); time += dt;
    const W = innerWidth, H = innerHeight;
    if (W < 2 || H < 2) return;
    if (W !== lastW || H !== lastH) { lastW = W; lastH = H; renderer.setSize(W, H, false); setFov(); if (!focus) goal.r = homeR(); }
    if (![cur.r, cur.th, cur.ph, cur.t.x, cur.t.y, cur.t.z].every(Number.isFinite)) { cur.t.copy(goal.t); cur.r = Number.isFinite(goal.r) ? goal.r : 28; cur.th = goal.th; cur.ph = goal.ph; }

    // intro
    if (introStart >= 0) {
      const t0 = time - introStart;
      intro.forEach(o => { const p = Math.min(1, Math.max(0, (t0 - o.delay) / .9)); o.g.visible = p > 0; o.g.userData.drop = 9 * (1 - easeOutBack(p)); });
    }
    intro.forEach(o => { if (!o.item) o.g.position.y = o.y + (o.g.userData.drop || 0); });

    // camera
    const par = focus || drag ? 0 : 1;
    const gth = goal.th + userTh + mouse.x * .02 * par, gph = goal.ph + userPh - mouse.y * .012 * par, gr = Math.max(4, goal.r + userR * (focus ? .4 : 1));
    const k = reduced ? 30 : 3.2;
    cur.t.x = damp(cur.t.x, goal.t.x, k, dt); cur.t.y = damp(cur.t.y, goal.t.y, k, dt); cur.t.z = damp(cur.t.z, goal.t.z, k, dt);
    cur.r = damp(cur.r, gr, k, dt); cur.th = damp(cur.th, gth, k, dt); cur.ph = damp(cur.ph, Math.max(.05, Math.min(1.2, gph)), k, dt);
    camera.position.set(cur.t.x + cur.r * Math.cos(cur.ph) * Math.sin(cur.th), cur.t.y + cur.r * Math.sin(cur.ph), cur.t.z + cur.r * Math.cos(cur.ph) * Math.cos(cur.th));
    camera.lookAt(cur.t);
    // hover lift
    for (const [id, it] of Object.entries(ITEMS)) {
      const target = (hoverId === id && !focus) || focus === id ? 1 : 0;
      it.h = damp(it.h, target, 10, dt);
      it.obj.position.y = it.base.y + (it.lift || 0) * it.h + (it.obj.userData.drop || 0);
      if (it.push) it.obj.position.z = it.base.z + it.push * it.h;
      if (it.pushX) it.obj.position.x = it.base.x + it.pushX * it.h;
      if (it.tag) it.tag.classList.toggle("on", hoverId === id);
    }

    // steam
    steams.forEach(s => { s.userData.t = (s.userData.t + dt * .35) % 1; const t = s.userData.t; s.position.set(Math.sin(t * 6 + s.id) * .08, .5 + t * 1.1, 0); s.scale.setScalar(.2 + t * .5); s.material.opacity = Math.sin(t * Math.PI) * .45; });

    // cat
    body.scale.y = .62 + Math.sin(time * 2.2) * .02;
    if (catHop > 0) { catHop = Math.max(0, catHop - dt * 1.8); cat.position.y = it_base(cat) + Math.sin((1 - catHop) * Math.PI) * .6; cat.rotation.y = -.3 + (1 - catHop) * Math.PI * 2; }
    if (bubbleT > 0) { bubbleT -= dt; tmpV.set(2.35, 2.6, -1.95).project(camera); bubble.style.transform = `translate(${(tmpV.x * .5 + .5) * innerWidth}px, ${(-tmpV.y * .5 + .5) * innerHeight}px) translate(-50%,-100%)`; bubble.classList.add("show"); } else bubble.classList.remove("show");

    // globe
    globeSpin = damp(globeSpin, 0, 1.2, dt); gb.rotation.y += dt * (.25 + globeSpin);

    // day / night blend
    nightT = damp(nightT, night ? 1 : 0, 2.5, dt);
    scene.background.copy(DAY_BG).lerp(NIGHT_BG, nightT);
    sun.intensity = 1.9 - nightT * 1.65; sun.color.copy(sunDay).lerp(sunNight, nightT);
    hemi.intensity = .32 - nightT * .2;
    renderer.toneMappingExposure = .94 - nightT * .08;
    allMats.forEach(m => { m.envMapIntensity = .62 - nightT * .45; });
    gNight.material.opacity = nightT;
    bulbMat.emissiveIntensity = .3 + nightT * 2.6 + Math.sin(time * 3) * .2 * nightT;
    stringLight.intensity = nightT * 1.1;
    const lampT = lampOn ? 1 : 0; lamp.userData.l = damp(lamp.userData.l || 0, lampT, 6, dt);
    lampLight.intensity = lamp.userData.l * 2.6; bulbM.emissiveIntensity = lamp.userData.l * 3;

    // dust drift
    const pa = dGeo.attributes.position.array;
    for (let i = 0; i < dustN; i++) { pa[i * 3 + 1] += dt * .08; pa[i * 3] += Math.sin(time * .3 + i) * dt * .03; if (pa[i * 3 + 1] > 7.6) pa[i * 3 + 1] = 0; }
    dGeo.attributes.position.needsUpdate = true; dust.material.opacity = .45 + nightT * .2;

    updateRide(dt);
    updateMe(dt);
    updateOutdoors(dt);

    // piano: notes, keys, metronome
    const noteOn = hoverId === "piano" || focus === "piano" || noteBurst > 0 ? 1 : 0; noteBurst = Math.max(0, noteBurst - dt);
    notes.forEach(sp => { sp.userData.t = (sp.userData.t + dt * (.18 + noteOn * .3)) % 1; const t = sp.userData.t; sp.position.set(-5.3 + t * 1.3, 1.5 + t * 2.3, -2.2 + Math.sin(t * 5 + sp.userData.ph) * .8); sp.scale.setScalar(.32 + t * .18); sp.material.opacity = Math.sin(t * Math.PI) * (.12 + noteOn * .85); });
    pianoKeys.forEach(k => { if (k.userData.p > 0) k.userData.p = Math.max(0, k.userData.p - dt * 4); k.position.y = k.userData.y0 - .035 * (k.userData.p || 0); });
    pend.rotation.z = Math.sin(time * 3.4) * (focus === "piano" || noteBurst > 0 ? .55 : .12);

    // labels
    let tagPos = null;
    const topSafe = (window.__topbarH || (window.__topbarH = $(".topbar").getBoundingClientRect().bottom || 70)) + 46;
    for (const it of Object.values(ITEMS)) {
      if (!it.tag) continue;
      tmpV.copy(it.anchor); tmpV.y += it.obj.position.y - it.base.y; tmpV.project(camera);
      // 不让气泡钻到顶部导航栏下面或跑出屏幕（否则鼠标会被导航栏挡住）
      const x = Math.min(innerWidth - 70, Math.max(70, (tmpV.x * .5 + .5) * innerWidth)), y = Math.max(topSafe, (-tmpV.y * .5 + .5) * innerHeight);
      (tagPos || (tagPos = [])).push({ it, x, y });
      it.tag.style.visibility = tmpV.z > 1 ? "hidden" : "visible";
    }
    // 防重叠：高度相近（相差不到 40px）的气泡，水平间距至少 76px，互相推开
    if (tagPos) {
      tagPos.sort((a, b) => a.x - b.x);
      for (let pass = 0; pass < 4; pass++) for (let i = 0; i < tagPos.length; i++) for (let j = i + 1; j < tagPos.length; j++) {
        const a = tagPos[i], b = tagPos[j];
        if (Math.abs(a.y - b.y) >= 40) continue;
        const gap = 76 - (b.x - a.x); if (gap <= 0) continue;
        a.x -= gap / 2; b.x += gap / 2;
      }
      for (const p of tagPos) p.it.tag.style.translate = `${Math.min(innerWidth - 40, Math.max(40, p.x))}px ${p.y}px`;
      tagPos.length = 0;
    }

    renderer.render(scene, camera);
  }
  const catBaseY = cat.position.y; function it_base() { return catBaseY; }

  if (!T.ColorManagement) {
    const mats = new Set();
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => mats.add(m)); if (o.isLight && o.color) o.color.convertSRGBToLinear(); if (o.isHemisphereLight) o.groundColor.convertSRGBToLinear(); });
    mats.forEach(m => { if (m.color && !m.map) m.color.convertSRGBToLinear(); if (m.emissive) m.emissive.convertSRGBToLinear(); });
    sunDay.convertSRGBToLinear(); sunNight.convertSRGBToLinear();
  }
  renderer.compile(scene, camera);
  frame();
  return () => { introStart = time + .1; setTimeout(() => { me.visible = true; walkTo(2.2, .6, [0, 1], "一起在小屋里走走吧。"); }, 1500); };
}

/* boot */
function loadScript(src, ms) {
  return new Promise((res, rej) => {
    const sc = document.createElement("script"); sc.src = src;
    const t = setTimeout(() => rej(new Error("timeout: " + src)), ms);
    sc.onload = () => { clearTimeout(t); res(src); }; sc.onerror = () => { clearTimeout(t); rej(new Error("failed: " + src)); };
    document.head.appendChild(sc);
  });
}
async function loadThree() {
  const V = "0.147.0", lines = [
    { core: "vendor/three.min.js", ex: "vendor/", flat: true, ms: 8000 },
    { core: `https://registry.npmmirror.com/three/${V}/files/build/three.min.js`, ex: `https://registry.npmmirror.com/three/${V}/files/examples/js/`, ms: 8000 },
    { core: `https://cdn.jsdelivr.net/npm/three@${V}/build/three.min.js`, ex: `https://cdn.jsdelivr.net/npm/three@${V}/examples/js/`, ms: 8000 },
    { core: `https://unpkg.com/three@${V}/build/three.min.js`, ex: `https://unpkg.com/three@${V}/examples/js/`, ms: 10000 }
  ];
  const errs = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (i > 0) $(".ld .t").textContent = "网络有点慢，换一条线路…（" + (i + 1) + "/" + lines.length + "）";
    try {
      await loadScript(L.core, L.ms);
      if (!window.THREE) throw new Error("no THREE");
      window.__T = window.THREE;
      if (L.ex) await Promise.allSettled([loadScript(L.ex + (L.flat ? "" : "geometries/") + "RoundedBoxGeometry.js", 6000), loadScript(L.ex + (L.flat ? "" : "environments/") + "RoomEnvironment.js", 6000)]);
      $(".ld .t").textContent = "正在布置小屋……";
      return;
    } catch (e) { errs.push(e.message); if (window.THREE) { window.__T = window.THREE; return; } }
  }
  throw new Error("3D 引擎没能从 CDN 加载（" + errs.length + " 条线路都失败了）");
}
function afterLoad(fn) { if (document.readyState === "complete") setTimeout(fn, 0); else addEventListener("load", () => setTimeout(fn, 0), { once: true }); }
afterLoad(async () => {
  let startIntro = null;
  try { await loadThree(); startIntro = await init3D(); }
  catch (err) { console.error(err); $("#fbwhy").textContent = String(err && err.message || err); $("#fallback").classList.add("show"); }
  $("#loader").hidden = true;
  startIntro && startIntro();
});
