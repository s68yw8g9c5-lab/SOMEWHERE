// Somewhere: the browser side of the game. 5 places a day, 3 clues each.
// Also plays single riddles that friends write for each other (links with #r=...).
import {
  dayNumber, nextPuzzleAt, puzzlesFor, dateFor, hasDate, distanceKm, scoreFor, roundSquare,
  CLUE_MULT, SPEED, speedFactor, MAX_CLUES, MAX_POINTS, MAX_TOTAL, LEVELS, HARD_ROUND, maxFor,
} from "./game.js";

const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(Number(n)).toLocaleString("en-US");
const fmtKm = (km) => (km = Number(km), (km < 10 ? km.toFixed(1) : fmt(km)) + " km");
const multTxt = (n) => "×" + CLUE_MULT[n - 1].toFixed(2).replace(/0$/, "");
const params = new URLSearchParams(location.search);

/* ---------- storage (wrapped: private windows can throw) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------- friend-made riddles: the whole riddle lives in the link ---------- */
const RKEY = "somewhere";
function encodeRiddle(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  bytes.forEach((b, i) => { bin += String.fromCharCode(b ^ RKEY.charCodeAt(i % RKEY.length)); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeRiddle(code) {
  const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ RKEY.charCodeAt(i % RKEY.length));
  return JSON.parse(new TextDecoder().decode(bytes));
}
function parseCustom() {
  const m = location.hash.match(/^#r=([A-Za-z0-9_-]{10,3000})$/);
  if (!m) return null;
  try {
    const o = decodeRiddle(m[1]);
    const clues = (Array.isArray(o.c) ? o.c : []).map((c) => String(c).slice(0, 160)).filter(Boolean).slice(0, MAX_CLUES);
    const lat = Number(o.la), lon = Number(o.lo);
    if (!clues.length || !(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return null;
    let id = 0; for (const ch of m[1]) id = (id * 31 + ch.charCodeAt(0)) >>> 0;
    return { name: String(o.n || "A secret place").slice(0, 60), lat, lon, clues, fact: String(o.f || "").slice(0, 200), by: String(o.b || "A friend").slice(0, 20), id: id.toString(36) };
  } catch { return null; }
}
window.addEventListener("hashchange", () => location.reload());

// Tester mode (?dev): replay any day, nothing is sent to the leaderboard, saves are kept apart.
const DEV = params.has("dev");
const DEV_DAYS = Array.from({ length: 60 }, (_, i) => i + 1).filter((d) => hasDate(d));
const DAY = DEV && DEV_DAYS.includes(Number(params.get("day"))) ? Number(params.get("day")) : dayNumber();
const CUSTOM = parseCustom();
const PUZ = CUSTOM ? [CUSTOM] : puzzlesFor(DAY);
const N = PUZ.length;
const TOTAL = CUSTOM ? MAX_POINTS : PUZ.reduce((t, p) => t + maxFor(p), 0); // 5,000 once a day has the 1-2-2 mix
const THEME = { emoji: "🍿", name: "Books & movies", about: "each riddle points to a real place from a famous book or movie" };
const levelOf = (p) => (LEVELS[p.level] ? p.level : "medium");
const levelPill = (p) => CUSTOM ? "" : `<span class="lvl lvl-${levelOf(p)}">${LEVELS[levelOf(p)].label}</span>`;
const crackedHard = () => !CUSTOM && state.rounds[HARD_ROUND]?.done && state.rounds[HARD_ROUND].done.score >= LEVELS.hard.max / 2;
const STATE_KEY = CUSTOM ? `sw:custom:${CUSTOM.id}` : DEV ? `sw:dev:${DAY}` : `sw:game:${DAY}`;
const fresh = () => ({
  round: 0, started: Date.now(), final: null,
  rounds: Array.from({ length: N }, () => ({ clues: 1, pin: null, done: null, shown: null })),
});
let state = store.get(STATE_KEY, null);
if (!state || !Array.isArray(state.rounds) || state.rounds.length !== N) state = fresh();
const save = () => store.set(STATE_KEY, state);
// The speed clock for each riddle starts when it first appears on a ready map (reloading
// doesn't reset it). The first one starts after the map has loaded, so slow phones aren't punished.
const startClock = () => { const r = state.rounds[state.round]; if (r && !r.done && !state.final && !r.shown) { r.shown = Date.now(); save(); } };
save();

const cur = () => state.rounds[state.round];
const curPuz = () => PUZ[state.round];
// "guess" = pin dropping, "round" = one round's answer, "final" = the day's summary.
const view = () => state.final ? "final" : cur().done ? "round" : "guess";
const doneRounds = () => state.rounds.filter((r) => r.done);
const runningTotal = () => doneRounds().reduce((s, r) => s + r.done.score, 0);
const totalClues = () => doneRounds().reduce((s, r) => s + r.done.clues, 0);

let player = store.get("sw:player", null);
if (!player) {
  player = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  store.set("sw:player", player);
}
let myName = store.get("sw:name", null);
if (!myName) { myName = randomName(); store.set("sw:name", myName); }

let preview = location.protocol === "file:";
let lastStats = null;

// Streamer mode: answers stay blurred (and off the map) until you tap "Reveal".
let streamer = params.has("streamer") || store.get("sw:streamer", false);
let spoilerOpen = false;
const hideAnswers = () => streamer && !spoilerOpen && view() !== "guess";

/* ---------- names, flags ---------- */
function randomName() {
  const a = ["Swift", "Curious", "Lucky", "Quiet", "Bold", "Clever", "Sunny", "Misty", "Wild", "Brave", "Cosmic", "Nimble", "Wandering", "Golden", "Polar"];
  const b = ["Albatross", "Otter", "Fox", "Nomad", "Compass", "Falcon", "Voyager", "Lynx", "Orca", "Pilot", "Comet", "Heron", "Yak", "Gecko", "Puffin"];
  return a[Math.floor(Math.random() * a.length)] + " " + b[Math.floor(Math.random() * b.length)];
}
const flag = (cc) => (/^[A-Z]{2}$/.test(cc || "") && cc !== "XX" && cc !== "T1")
  ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🏳️";
let regionNames;
try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch {}
const countryName = (cc) => { try { return regionNames && cc !== "XX" ? regionNames.of(cc) : "Unknown"; } catch { return cc; } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Anonymous usage counts (Umami, no cookies), like Driftline. Never sends names or pins.
const track = (name, data) => { try { window.umami?.track(name, data); } catch {} };
const kmBucket = (km) => km <= 100 ? "under 100 km" : km <= 500 ? "100-500 km" : km <= 1500 ? "500-1500 km" : km <= 5000 ? "1500-5000 km" : "5000+ km";
const scoreBucket = (s) => `${Math.floor(s / 1000)}k-${Math.floor(s / 1000) + 1}k`;

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}
async function copyOrShare(text, okMsg, files) {
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share(files ? { files, text } : { text }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { prompt("Copy this:", text); }
}

/* ---------- clues ---------- */
function renderClues(animateLast = false) {
  $("#day-label").textContent = CUSTOM ? `By ${CUSTOM.by}` : `${dateFor(DAY).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} · No. ${DAY}`;
  const th = $("#theme-line");
  th.hidden = !!CUSTOM;
  if (!CUSTOM) {
    const fp = view() !== "final" && curPuz();
    if (fp && fp.from) {
      const m = fp.from.match(/^(\S+)\s+(.*)$/), kind = m && m[1] === "📖" ? "Book" : "Film";
      th.dataset.level = fp.level || "";
      // The title stays a secret until the guess is locked in, then it's part of the reveal.
      const shown = !!cur().done;
      th.classList.toggle("secret", !shown);
      th.innerHTML = `<span class="kind kind-${kind.toLowerCase()}">${kind}</span><span class="src">${shown ? esc(m ? m[2] : fp.from) : `Title revealed after your guess`}</span><span class="clock" id="clock"></span>`;
      drawClock();
    } else th.textContent = THEME.name;
    th.title = `Today's theme: ${THEME.about}`;
  }
  const v = view();
  $("#clues").hidden = v === "final";
  if (v === "final") return;
  const r = cur(), p = curPuz(), maxC = p.clues.length;
  const n = r.done ? r.done.clues : r.clues;
  // After the guess, show the clues you skipped too (unless streamer mode is hiding answers).
  const shown = r.done && !hideAnswers() ? maxC : n;
  const list = $("#clue-list");
  list.innerHTML = "";
  for (let i = 0; i < shown; i++) {
    const li = document.createElement("li");
    li.dataset.n = i + 1;
    li.innerHTML = `<span class="verse">${p.clues[i].split(" / ").map((l) => `<span class="ln">${esc(l)}</span>`).join("")}</span>`; // rhymes: one line per verse
    if (animateLast && i === shown - 1) li.className = "reveal";
    if (r.done && i >= n) li.classList.add("unused");
    if (i === n - 1) li.classList.add("current");
    list.appendChild(li);
  }
  const rl = $("#round-label");
  if (CUSTOM) { rl.textContent = "Friend's riddle"; rl.classList.remove("frames"); }
  else {
    rl.classList.add("frames");
    rl.setAttribute("aria-label", `Round ${state.round + 1} of ${N}`);
    rl.innerHTML = Array.from({ length: N }, (_, i) => `<i class="${i < state.round ? "done" : i === state.round ? "now" : ""}${PUZ[i]?.level === "hard" ? " hard" : ""}"></i>`).join("") + `<b>Scene ${state.round + 1} of ${N}</b>`;
  }
  $("#total-label").textContent = `Score ${fmt(runningTotal())}`;
  $("#total-label").hidden = !!CUSTOM;
  const lv = levelOf(p), lvEl = $("#level");
  lvEl.hidden = !!CUSTOM;
  lvEl.className = `lvl lvl-${lv}`;
  lvEl.textContent = `${LEVELS[lv].label}, worth ${fmt(Math.round(LEVELS[lv].max * CLUE_MULT[n - 1]))}`;
  lvEl.title = `${LEVELS[lv].label} riddle: worth up to ${fmt(LEVELS[lv].max)} points`;
  $("#clue-count").textContent = r.done ? `${n} of ${maxC} clues used` : `Clue ${n} of ${maxC}`;
  $("#mult").textContent = multTxt(n);
  $("#mult").title = `Clue multiplier: your points this round are ${multTxt(n)}`;
  $("#next-clue").hidden = !!r.done || n >= maxC;
  if (n < maxC) $("#next-cost").textContent = `· round worth ${fmt(Math.round(LEVELS[lv].max * CLUE_MULT[n]))} after`;
}

$("#next-clue").addEventListener("click", () => {
  const r = cur();
  if (r.done || r.clues >= curPuz().clues.length) return;
  r.clues++; save(); renderClues(true);
  track("Reveal clue", { clue: r.clues, round: state.round + 1, day: DAY, custom: !!CUSTOM });
});

/* ---------- map: MapLibre with the free OpenFreeMap street map ----------
   Zooms from the whole world down to street level. If the street map can't load
   (blocked network, outage), it switches to a simple built-in world map. */
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const STREET_ZOOM = 5.5;   // street-map detail appears from this zoom level in
// Within 25 km already scores full points, so there's no need for house-level zoom. The street
// map's data stops at zoom 14; going past that makes the map re-cut the same data at every step.
const MAX_ZOOM = 15;
// Layers the game doesn't need. In big cities these are the heaviest part of the map
// (millions of building shapes, shop icons, arrows), and they made zooming into cities lag.
const SKIP_LAYERS = /^(building|poi_|road_one_way|highway-name-path|highway-name-minor|road_area_pattern)|hatching/;
const map = { gl: null, ready: false, land: null, fallback: false, tilesOk: false, tileErrors: 0, markers: { mine: [], answer: [] } };
window.__swMap = map; // handy for debugging in the browser console
const fc = (features) => ({ type: "FeatureCollection", features });
const isPhone = () => matchMedia("(max-width: 640px)").matches;

// Web maps can't draw the poles, and a few shapes (Russia, Fiji) cross the date line.
// Shift those across so the simple map draws them in one piece, and leave out Antarctica.
function mercatorSafe(geo) {
  const fixRing = (r) => {
    let jump = 0;
    for (let i = 1; i < r.length; i++) jump = Math.max(jump, Math.abs(r[i][0] - r[i - 1][0]));
    return jump > 180 ? r.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]) : r;
  };
  const features = geo.features.filter((f) => f.geometry && f.properties?.name !== "Antarctica").map((f) => {
    const g = f.geometry;
    const coordinates = g.type === "Polygon" ? g.coordinates.map(fixRing) : g.coordinates.map((p) => p.map(fixRing));
    return { ...f, geometry: { ...g, coordinates } };
  });
  return { type: "FeatureCollection", features };
}
// Board-game palette: the sea is the cream board, countries are colored tiles.
// Newspaper map: warm paper sea, stone-grey land, fine borders, a faint grid.
const SEA = "#a9cbc0", LAND = "#f6eed9", GRID = "rgba(40,90,80,.10)", EDGE = "#c9b68a";
function graticule() {
  const f = [], line = (c) => f.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } });
  for (let lon = -180; lon <= 180; lon += 15) line(Array.from({ length: 35 }, (_, k) => [lon, -85 + k * 5]));
  for (let lat = -75; lat <= 75; lat += 15) line(Array.from({ length: 73 }, (_, k) => [-180 + k * 5, lat]));
  return { type: "FeatureCollection", features: f };
}
// State and province lines for the big countries (USA, Canada, Brazil, India, China, Russia,
// Australia...), drawn on the light zoomed-out map. The street map has its own from STREET_ZOOM on.
const EMPTY_LINES = { type: "FeatureCollection", features: [] };
const STATES_LAYER = (extra = {}) => ({ id: "lo-states", type: "line", source: "states", minzoom: 2.5, ...extra,
  paint: { "line-color": "rgba(18,18,18,.12)", "line-width": ["interpolate", ["linear"], ["zoom"], 2.5, 0.5, 5, 1], "line-dasharray": [3, 2] } });
function loadStates() {
  fetch("vendor/states-50m.json").then((r) => r.json()).then((g) => {
    map.states = g;
    map.gl?.getSource("states")?.setData(g);
  }).catch(() => {});
}
function fallbackStyle() {
  return {
    version: 8,
    sources: { land: { type: "geojson", data: mercatorSafe(map.land) }, states: { type: "geojson", data: map.states || EMPTY_LINES }, grid: { type: "geojson", data: graticule() } },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": SEA } },
      { id: "grid", type: "line", source: "grid", paint: { "line-color": GRID, "line-width": 1 } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": LAND } },
      { id: "borders", type: "line", source: "land", paint: { "line-color": EDGE, "line-width": 0.6 } },
      STATES_LAYER(),
    ],
  };
}

async function initMap() {
  const topo = await fetch("vendor/countries-50m.json").then((r) => r.json());
  map.land = topojson.feature(topo, topo.objects.countries);   // also used for the share card
  loadStates();
  const gl = map.gl = new maplibregl.Map({
    container: "map", style: STYLE_URL, center: [10, 22], zoom: 1, minZoom: 0, maxZoom: MAX_ZOOM, maxTileCacheSize: 600,
    dragRotate: false, pitchWithRotate: false, maxPitch: 0, fadeDuration: 0, pixelRatio: Math.min(devicePixelRatio || 1, 2), attributionControl: { compact: true },
  });
  gl.touchZoomRotate.disableRotation();
  gl.touchPitch.disable();
  gl.keyboard.disableRotation();
  const useFallback = () => {
    if (map.fallback) return;
    map.fallback = true;
    gl.setStyle(fallbackStyle());
  };
  const timer = setTimeout(() => { if (!map.ready) useFallback(); }, 9000);
  gl.on("error", () => {
    // The street map's style didn't load, or its tiles keep failing: use the simple map instead.
    if (!map.ready || (!map.tilesOk && ++map.tileErrors >= 3)) useFallback();
  });
  gl.on("data", (e) => { if (e.dataType === "source" && e.tile && e.sourceId === "openmaptiles") map.tilesOk = true; });
  gl.once("style.load", () => clearTimeout(timer));
  gl.on("style.load", () => { addOverlays(); if (map.ready) drawAll(); });
  gl.on("click", (e) => onMapClick([Math.round(e.lngLat.lat * 1e4) / 1e4, Math.round(e.lngLat.wrap().lng * 1e4) / 1e4]));
  await new Promise((res) => gl.once("style.load", res));
  map.ready = true;
  if (view() !== "guess" && !making) fitToResult(false);
  else resetZoom(false);
}

// Our own layers on top of whichever base map is showing.
function addOverlays() {
  const gl = map.gl;
  if (!map.fallback && !gl.getLayer("lo-land")) {
    // 3D buildings look nice but are slow on phones, and the game never tilts the map.
    // The shaded-relief picture layer is also heavy, so both go.
    for (const l of gl.getStyle().layers) if (l.type === "fill-extrusion" || l.type === "raster" || l.type === "hillshade" || SKIP_LAYERS.test(l.id)) gl.removeLayer(l.id);
    // Zoomed out, the street map's tiles are huge (up to 1.5 MB each), which makes zooming laggy.
    // So below STREET_ZOOM we draw our own light world map, and street detail starts after that.
    for (const l of gl.getStyle().layers) {
      if (l.source === "openmaptiles") gl.setLayerZoomRange(l.id, Math.max(l.minzoom || 0, STREET_ZOOM), l.maxzoom ?? 24);
    }
    const first = gl.getStyle().layers.find((l) => l.type !== "background")?.id;
    if (!gl.getSource("land")) gl.addSource("land", { type: "geojson", data: mercatorSafe(map.land) });
    if (!gl.getSource("grid")) gl.addSource("grid", { type: "geojson", data: graticule() });
    gl.addLayer({ id: "lo-ocean", type: "background", maxzoom: STREET_ZOOM, paint: { "background-color": SEA } }, first);
    gl.addLayer({ id: "lo-grid", type: "line", source: "grid", maxzoom: STREET_ZOOM, paint: { "line-color": GRID, "line-width": 1 } }, first);
    gl.addLayer({ id: "lo-land", type: "fill", source: "land", maxzoom: STREET_ZOOM, paint: { "fill-color": LAND } }, first);
    gl.addLayer({ id: "lo-borders", type: "line", source: "land", maxzoom: STREET_ZOOM, paint: { "line-color": EDGE, "line-width": 0.6 } }, first);
    if (!gl.getSource("states")) gl.addSource("states", { type: "geojson", data: map.states || EMPTY_LINES });
    gl.addLayer(STATES_LAYER({ maxzoom: STREET_ZOOM }), first);
    // Show place names in English where the map has them.
    for (const l of gl.getStyle().layers) {
      if (l.type === "symbol" && l.layout && l.layout["text-field"]) {
        gl.setLayoutProperty(l.id, "text-field", ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name"]]);
      }
    }
  }
  // No player dots or crowd dots on the map, ever: only your pin, the answer and the line between.
  if (!gl.getSource("lines")) gl.addSource("lines", { type: "geojson", data: fc([]) });
  if (!gl.getLayer("lines")) gl.addLayer({ id: "lines", type: "line", source: "lines",
    layout: { "line-cap": "round" }, paint: { "line-color": "#2f4a35", "line-width": 3, "line-dasharray": [0.1, 2] } });
}
const setData = (id, data) => { const s = map.gl?.getSource(id); if (s) { s.setData(data); nudgeSoon(); } };
// After new data or a big camera jump, MapLibre can skip drawing one copy of the world
// until the camera moves again. A tiny invisible move once things settle fixes it.
function nudgeSoon() {
  clearTimeout(map.nudgeTimer);
  map.nudgeTimer = setTimeout(() => {
    if (!map.gl || map.gl.isMoving()) return nudgeSoon();
    map.gl.panBy([1, 0], { duration: 0 });
    map.gl.panBy([-1, 0], { duration: 0 });
  }, 400);
}

// Curved, shortest-path line between two points, with longitudes kept continuous so it
// doesn't jump across the whole map when it crosses the date line.
function arc(from, to) {
  const interp = d3.geoInterpolate([from[1], from[0]], [to[1], to[0]]);
  const pts = [];
  let prev = null;
  for (let i = 0; i <= 64; i++) {
    let [lon, lat] = interp(i / 64);
    if (prev != null) { while (lon - prev > 180) lon -= 360; while (lon - prev < -180) lon += 360; }
    pts.push([lon, lat]); prev = lon;
  }
  return pts;
}

// On narrow screens the whole world is a thin strip, so start zoomed on the middle of it.
function resetZoom(animate) {
  if (!map.ready) return;
  const opts = { duration: animate ? 700 : 0 };
  if (isPhone()) map.gl.easeTo({ center: [10, 22], zoom: 0.9, ...opts });
  else {
    const cam = map.gl.cameraForBounds([[-165, -56], [180, 74]], { padding: { top: 70, bottom: 90, left: 20, right: 20 } });
    map.gl.easeTo({ center: cam.center, zoom: cam.zoom, padding: { top: 0, bottom: 0, left: 0, right: 0 }, ...opts });
  }
}

function onMapClick(ll) {
  if (making) return makerClick(ll);
  if (view() !== "guess") return;
  const r = cur();
  if (!r.pin && state.round === 0) track("First pin", { clues: r.clues, day: DAY, custom: !!CUSTOM });
  r.pin = ll;
  save();
  drawMine();
  $("#map-hint").style.opacity = 0;
  updateLock();
}

// A few HTML markers (your pins, the answer stars) sit above the map layers.
const PIN_SVG = `<svg viewBox="-10 -26 20 27" width="30" height="40"><path d="M0,0 C-2,-6 -8,-9 -8,-15 A8,8 0 1 1 8,-15 C8,-9 2,-6 0,0Z" fill="#ee7a3b" stroke="#fff" stroke-width="1.6"/><circle cy="-15" r="3" fill="#fff"/></svg>`;
function pinEl() { const d = document.createElement("div"); d.className = "mk mk-pin"; d.innerHTML = PIN_SVG; return d; }
function starEl(n) {
  const d = document.createElement("div"); d.className = "mk mk-star";
  // Numbered (final screen): the number replaces the centre dot so the two don't overlap.
  d.innerHTML = `<svg viewBox="-14 -14 28 28" width="38" height="38"><circle r="11" fill="#2f4a35" stroke="#fff" stroke-width="2.5"/>${n ? `<text text-anchor="middle" dy="0.36em" class="answer-num">${n}</text>` : `<circle r="4" fill="#fff"/>`}</svg>`;
  return d;
}
function setMarkers(kind, list, make, anchor) {
  if (!map.ready) return;
  map.markers[kind].forEach((m) => m.remove());
  map.markers[kind] = list.map((p) => new maplibregl.Marker({ element: make(p[2]), anchor }).setLngLat([p[1], p[0]]).addTo(map.gl));
}

// Which rounds have their answer on the map right now.
function revealed() {
  const v = view();
  if (v === "final") return state.rounds.map((r, i) => i).filter((i) => state.rounds[i].done);
  if (v === "round") return [state.round];
  return [];
}

function drawMine() {
  let pins = view() === "guess"
    ? (cur().pin ? [cur().pin] : [])
    : revealed().map((i) => [state.rounds[i].done.glat, state.rounds[i].done.glon]);
  if (making) pins = [];
  setMarkers("mine", pins, pinEl, "bottom");
}
function drawAnswer() {
  if (making) {
    setData("lines", fc([]));
    setMarkers("answer", makerPin ? [[makerPin[0], makerPin[1], 0]] : [], starEl, "center");
    return;
  }
  const idx = hideAnswers() ? [] : revealed(), numbered = view() === "final" && N > 1;
  setData("lines", fc(idx.map((i) => ({ type: "Feature", properties: {}, geometry: { type: "LineString",
    coordinates: arc([state.rounds[i].done.glat, state.rounds[i].done.glon], [PUZ[i].lat, PUZ[i].lon]) } }))));
  setMarkers("answer", idx.map((i) => [PUZ[i].lat, PUZ[i].lon, numbered ? i + 1 : 0]), starEl, "center");
}
function drawAll() { if (!map.ready || !map.gl.getSource("lines")) { renderLegend(); return; } drawAnswer(); drawMine(); renderLegend(); }

function renderLegend() {
  const v = view();
  $("#legend").hidden = v === "guess" || making;
  $("#legend").innerHTML = v === "guess" || making
    ? ""
    : `<span><i style="background:var(--pin)"></i>You</span><span><i style="background:var(--answer)"></i>Answer</span>`;
}

function fitToResult(animate = true) {
  const idx = revealed();
  if (!idx.length || !map.ready) return;
  // In streamer mode with answers hidden, only frame your own pins so the view gives nothing away.
  const coords = hideAnswers()
    ? idx.map((i) => [state.rounds[i].done.glon, state.rounds[i].done.glat])
    : idx.flatMap((i) => arc([state.rounds[i].done.glat, state.rounds[i].done.glon], [PUZ[i].lat, PUZ[i].lon]));
  const b = smartBounds(coords);
  // Only the part of the screen above the result sheet (and below the top bar) is visible.
  const el = $("#map"), W = el.clientWidth, H = el.clientHeight;
  const sheet = $("#result");
  const sheetH = sheet && !sheet.hidden ? sheet.offsetHeight + 20 : 0;
  const top = 76, bottom = Math.min(sheetH + 24, H - top - 120), side = Math.min(60, W / 6);
  // Work out the camera with padding, then move there without padding: a padded camera can
  // leave parts of the world undrawn when zoomed far out.
  const cam = map.gl.cameraForBounds(b, { padding: { top, bottom, left: side, right: side }, maxZoom: hideAnswers() ? 3 : 9 });
  if (!cam) return;
  map.gl.easeTo({ center: cam.center, zoom: cam.zoom, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: animate ? 1200 : 0 });
  nudgeSoon();
}

// The tightest box around some points, going across the date line if that is shorter.
function smartBounds(coords) {
  const lons = [...new Set(coords.map((c) => ((c[0] + 540) % 360) - 180))].sort((a, b) => a - b);
  let gap = lons[0] + 360 - lons[lons.length - 1], west = lons[0], east = lons[lons.length - 1];
  for (let i = 1; i < lons.length; i++) {
    if (lons[i] - lons[i - 1] > gap) { gap = lons[i] - lons[i - 1]; west = lons[i]; east = lons[i - 1] + 360; }
  }
  const lats = coords.map((c) => c[1]);
  return new maplibregl.LngLatBounds([west, Math.max(-80, Math.min(...lats))], [east, Math.min(82, Math.max(...lats))]);
}

$("#zoom-in").addEventListener("click", () => map.gl?.zoomIn());
$("#zoom-out").addEventListener("click", () => map.gl?.zoomOut());

/* ---------- guess ---------- */
function updateLock() {
  const btn = $("#lock-btn");
  $("#lock-bar").hidden = view() !== "guess";
  btn.disabled = !cur().pin;
  btn.textContent = cur().pin ? "Mark the spot" : "Tap the map to mark the spot";
}

$("#lock-btn").addEventListener("click", () => {
  const r = cur(), p = curPuz();
  if (!r.pin || r.done) return;
  const [glat, glon] = r.pin;
  const km = Math.round(distanceKm(glat, glon, p.lat, p.lon) * 10) / 10;
  const secs = CUSTOM ? 0 : secsOn(r);   // friend riddles have no clock
  r.done = { glat, glon, km, clues: r.clues, secs, score: scoreFor(km, r.clues, maxFor(curPuz()), secs) };
  spoilerOpen = false;
  save();
  track("Guess", { round: state.round + 1, clues: r.clues, distance: kmBucket(km), day: DAY, custom: !!CUSTOM });
  render(true);
});

function nextRound() {
  if (state.round < N - 1) {
    state.round++; startClock(); save();
    render(false);
    resetZoom(true);
    $("#map-hint").style.opacity = 1;
  } else finishGame();
}

async function finishGame() {
  const btn = $("#next-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Adding up your score…"; }
  spoilerOpen = false;
  if (CUSTOM) {
    state.final = { score: runningTotal(), km: doneRounds().reduce((s, r) => s + r.done.km, 0), custom: true };
    save();
    track("Finish friend riddle", { distance: kmBucket(state.final.km), clues: totalClues() });
    render(true);
    return;
  }
  const ms = Date.now() - state.started;
  let res = null;
  if (!preview && !DEV) {
    try {
      const r = await fetch("/api/play", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ day: DAY, player, name: myName, ms, rounds: state.rounds.map((x) => ({ lat: x.done.glat, lon: x.done.glon, clues: x.done.clues, secs: x.done.secs })) }),
      });
      if (r.ok) res = await r.json();
    } catch {}
  }
  if (res && Array.isArray(res.rounds)) {
    // Trust the server's numbers (and its copy, if this device already played today).
    res.rounds.forEach((x, i) => { state.rounds[i].done = { glat: x[0], glon: x[1], clues: x[2], km: Number(x[3]), score: x[4], secs: x[5] }; });
    state.final = { score: res.score, km: Number(res.km), beat: res.beat, players: res.players };
  } else {
    const score = runningTotal();
    state.final = { score, km: doneRounds().reduce((s, r) => s + r.done.km, 0), beat: null, players: lastStats?.players || 1, local: true };
    if (!preview && !DEV) toast("Couldn't reach the server. Your result is saved on this device.");
  }
  save();
  recordHistory();
  const st = streakInfo();
  track("Finish game", { score: scoreBucket(state.final.score), clues: totalClues(), streak: st.count, day: DAY, offline: !!state.final.local });
  render(true);
  refreshStats(true);
  loadFriends();
}

/* ---------- streak, with one free "saver" a week ---------- */
function recordHistory() {
  if (DEV) return;
  const h = store.get("sw:history", {});
  h[DAY] = state.final.score;
  store.set("sw:history", h);
}
// Walks back from today. A single missed day is forgiven once per week (weeks run from day 1),
// so one busy day doesn't wipe out a long streak.
function streakInfo() {
  const h = store.get("sw:history", {});
  const week = (d) => Math.floor((d - 1) / 7);
  const usedWeeks = new Set(), saved = [];
  let d = h[DAY] != null ? DAY : DAY - 1, count = 0;
  while (d >= 1) {
    if (h[d] != null) { count++; d--; continue; }
    if (h[d - 1] != null && !usedWeeks.has(week(d))) { usedWeeks.add(week(d)); saved.push(d); d--; continue; }
    break;
  }
  return { count, saved, saverReady: !usedWeeks.has(week(DAY)) };
}

/* ---------- result sheet ---------- */
const spoilerBtn = () => hideAnswers() ? `<button class="ghost reveal-btn" id="reveal-btn">Reveal the answer${N > 1 && view() === "final" ? "s" : ""}</button>` : "";

// Scout calls each round: a speech bubble and up to 3 stars, from the share of points won.
function gradeHTML(score, max) {
  const p = score / max, n = p >= .85 ? 3 : p >= .6 ? 2 : p >= .3 ? 1 : 0;
  const star = (on) => `<svg viewBox="0 0 24 24" width="22" height="22" class="${on ? "on" : ""}" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" stroke-linejoin="round" stroke-width="2"/></svg>`;
  return `<div class="grade"><span class="stars" aria-label="${n} of 3 stars">${[0, 1, 2].map((i) => star(i < n)).join("")}</span><b>${["Cut! Try again", "Nice try", "So close!", "That's a wrap!"][n]}</b></div>`;
}

function roundHTML() {
  const r = cur().done, p = curPuz(), last = state.round === N - 1;
  return `${gradeHTML(r.score, maxFor(p))}
    <div class="result-top">
      <div>
        <div class="eyebrow">${CUSTOM ? `${esc(CUSTOM.by)}'s riddle` : `Scene ${state.round + 1} of ${N}`}. The location:</div>
        <h2 class="spoiler">${esc(p.name)}</h2>
      </div>
      <div class="km"><b>${fmtKm(r.km)}</b><span>off the mark</span></div>
    </div>
    <div class="scorebar"><div class="fill" id="r-bar" data-w="${(r.score / maxFor(p) * 100).toFixed(1)}"></div></div>
    <div class="score-line">
      <span><b>${fmt(r.score)}</b> of ${fmt(maxFor(p))} points</span>
      ${CUSTOM ? "" : `<span class="muted">Total <b>${fmt(runningTotal())}</b></span>`}
    </div>
    ${r.secs != null ? `<p class="speed-line">Answered in ${fmtSecs(r.secs)}. ${speedNote(r.secs)}</p>` : ""}
    ${p.fact ? `<p class="fact spoiler"><b>Scout's notes</b> ${esc(p.fact)}</p>` : ""}
    ${spoilerBtn()}
    <button class="guess" id="next-btn">${last ? (CUSTOM ? "See your score" : "See today's reel") : "Next scene"}</button>`;
}

function speedNote(t) {
  const f = speedFactor(t);
  return f >= 1 ? "Full speed bonus." : f > 0 ? `Speed bonus ${Math.round(f * 100)}%.` : `No speed bonus (answer within ${SPEED.full} seconds for all of it).`;
}

function streakHTML() {
  const s = streakInfo();
  const savedYesterday = s.saved.includes(DAY - 1);
  return `<div class="streak-box">
      <div><b>${s.count} day${s.count === 1 ? "" : "s"} in a row</b>
        <span class="sub">${savedYesterday ? "Your weekly saver kept your streak alive yesterday." : s.saverReady ? "Streak saver ready: miss one day this week and your streak survives." : "Saver used this week. Come back tomorrow!"}</span></div>
    </div>`;
}

function finalHTML() {
  const f = state.final;
  const rows = state.rounds.map((x, i) => `
    <li><span class="sq sq-${["🟩","🟨","🟧","🟥"].indexOf(roundSquare(x.done.km))}" aria-hidden="true"></span>
      <span class="who">${N > 1 ? `${i + 1}. ` : ""}<span class="spoiler">${esc(PUZ[i].name)}</span><span class="sub">${CUSTOM ? "" : LEVELS[levelOf(PUZ[i])].label + " · "}${fmtKm(x.done.km)} · ${x.done.clues} clue${x.done.clues > 1 ? "s" : ""}${x.done.secs != null && x.done.secs < 86400 ? ` · ${fmtSecs(x.done.secs)}` : ""}</span></span>
      <span class="val">${fmt(x.done.score)}</span></li>`).join("");
  if (CUSTOM) return `
    <div class="result-top">
      <div>
        <div class="eyebrow">${esc(CUSTOM.by)}'s riddle · your score</div>
        <h2>${fmt(f.score)} <span class="of">/ ${fmt(TOTAL)}</span></h2>
      </div>
      <div class="km"><b>${fmtKm(f.km)}</b><span>from the answer</span></div>
    </div>
    <div class="scorebar"><div class="fill" id="r-bar" data-w="${(f.score / TOTAL * 100).toFixed(1)}"></div></div>
    <ol class="rounds">${rows}</ol>
    ${spoilerBtn()}
    <div class="share-row">
      <button class="guess small" id="share-btn">Tell ${esc(CUSTOM.by)} your score</button>
      <button class="ghost" id="make-btn">Write one back</button>
      <a class="ghost" href="/" id="daily-link">Play today's 5 places</a>
    </div>`;
  return `
    <div class="result-top">
      <div>
        <div class="eyebrow">Somewhere No. ${DAY} · ${THEME.name}</div>
        <h2>${fmt(f.score)} <span class="of">/ ${fmt(TOTAL)}</span></h2>
      </div>
      ${f.beat != null ? `<div class="km"><b>${f.beat}%</b><span>of players beaten</span></div>` : `<div class="km"><b>${fmtKm(f.km)}</b><span>off in total</span></div>`}
    </div>
    <div class="scorebar"><div class="fill" id="r-bar" data-w="${(f.score / TOTAL * 100).toFixed(1)}"></div></div>
    ${DEV ? "" : streakHTML()}
    <ol class="rounds">${rows}</ol>
    ${spoilerBtn()}
    <div class="share-row">
      <button class="guess small" id="share-btn" data-umami-event="Share result">Share result</button>
      <button class="ghost" id="card-btn" data-umami-event="Save image">Save image</button>
      <button class="ghost" id="friends-btn">${friendCode ? "Friends board" : "Challenge friends"}</button>
      <button class="ghost" id="result-boards" data-umami-event="Open leaderboard">Top scouts</button>
      <button class="ghost" id="make-btn">Write a riddle</button>
    </div>
    <div class="me-row">
      <label for="name-input">Your name on the board</label>
      <div class="name-edit">
        <input id="name-input" maxlength="20" autocomplete="off" value="${esc(myName)}">
        <button class="ghost" id="name-save" data-umami-event="Rename">Save</button>
      </div>
    </div>
    <div class="next">5 new places in <b id="countdown">--:--:--</b></div>`;
}

function bindSheet() {
  $("#next-btn")?.addEventListener("click", nextRound);
  $("#share-btn")?.addEventListener("click", share);
  $("#card-btn")?.addEventListener("click", saveCard);
  $("#result-boards")?.addEventListener("click", () => openBoards("players"));
  $("#friends-btn")?.addEventListener("click", () => openBoards("friends"));
  $("#make-btn")?.addEventListener("click", openMaker);
  $("#name-save")?.addEventListener("click", rename);
  $("#reveal-btn")?.addEventListener("click", revealSpoilers);
}

function revealSpoilers() {
  spoilerOpen = true;
  $("#result").classList.remove("hide-answers");
  $("#reveal-btn")?.remove();
  renderClues();
  drawAll();
  fitToResult(true);
  track("Reveal answers (streamer)");
}

// First look: a brand-new player sees only the riddle, the map and one button until their first guess.
// Tester mode always shows it, so "Play again" looks exactly like a first visit.
const isNewcomer = () => !CUSTOM && state.round === 0 && !cur().done && (DEV || !Object.keys(store.get("sw:history", {})).length);
function render(animate) {
  const v = view(), sheet = $("#result");
  document.body.classList.toggle("first-look", isNewcomer());
  renderClues();
  updateLock();
  $("#map-hint").hidden = v !== "guess";
  if (v === "guess") { sheet.hidden = true; sheet.innerHTML = ""; }
  else {
    // The scrolling happens in an inner box: a scrolling box directly over the map can stop
    // part of the map from drawing in some browsers.
    sheet.innerHTML = `<div class="sheet-body">${v === "final" ? finalHTML() : roundHTML()}</div>`;
    sheet.classList.toggle("hide-answers", hideAnswers());
    sheet.hidden = false;
    sheet.firstElementChild.scrollTop = 0;
    if (animate) { sheet.style.animation = "none"; void sheet.offsetWidth; sheet.style.animation = ""; }
    bindSheet();
    tick();
  }
  drawAll();
  if (v !== "guess" && matchMedia("(max-width: 640px)").matches) setClues(false);
  if (v === "guess") setClues(true);
  if (v !== "guess") requestAnimationFrame(() => {
    fitToResult(animate);
    const bar = $("#r-bar");
    if (bar) requestAnimationFrame(() => { bar.style.width = bar.dataset.w + "%"; });
  });
}

/* ---------- sharing (never gives away the answers) ---------- */
const siteUrl = () => location.origin.startsWith("http") ? location.origin : "";
function shareText() {
  const f = state.final;
  if (CUSTOM) return `I got ${fmt(f.score)} / ${fmt(TOTAL)} on your Somewhere riddle ${roundSquare(f.km)} (${fmtKm(f.km)} off)\n${location.href}`;
  const s = streakInfo().count;
  return [
    `Somewhere #${DAY} · ${THEME.emoji} ${THEME.name}`,
    `🌍 ${fmt(f.score)} / ${fmt(TOTAL)}`,
    state.rounds.map((x) => roundSquare(x.done.km)).join(""),
    `🔎 ${totalClues()} clues${f.beat != null ? ` · beat ${f.beat}%` : ""}${crackedHard() ? " · 💀 cracked the last one" : ""}${s > 1 ? ` · 🔥 ${s}` : ""}`,
    siteUrl(),
  ].filter(Boolean).join("\n");
}

function share() {
  track("Share result", { custom: !!CUSTOM });
  copyOrShare(shareText(), "Copied! Paste it anywhere.");
}

async function saveCard() {
  const blob = await makeCard();
  const file = new File([blob], `somewhere-${DAY}.png`, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ files: [file], text: shareText() }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// A 1080x1350 story-sized card. Spoiler-free: it shows how close you got each round,
// never where the places are, so it is safe to post before your friends have played.
async function makeCard() {
  const f = state.final, W = 1080, H = 1350;
  const INK = "#3f3224", MUTED = "#857561", PAPER = "#f6eed9", RULE = "#e3d7bd";
  const SERIF = "Fredoka, Nunito, sans-serif", SANS = "Nunito, Helvetica, Arial, sans-serif";
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  await document.fonts.ready;
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);

  // faint world in the background (no pins, so no spoilers)
  const proj = d3.geoNaturalEarth1().fitExtent([[60, 230], [W - 60, 760]], { type: "Sphere" });
  const path = d3.geoPath(proj, ctx);
  ctx.beginPath(); path(map.land); ctx.fillStyle = "#e7dcc0"; ctx.fill();

  // masthead, like a newspaper puzzle page
  ctx.fillStyle = INK; ctx.font = `600 76px ${SERIF}`; ctx.textAlign = "left"; ctx.fillText("Somewhere", 80, 150);
  ctx.fillStyle = MUTED; ctx.font = `500 34px ${SANS}`; ctx.textAlign = "right";
  ctx.fillText(`No. ${DAY} · ${dateFor(DAY).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`, W - 80, 148);
  ctx.fillStyle = "#2f4a35"; ctx.fillRect(80, 185, W - 160, 6);

  ctx.textAlign = "center";
  ctx.fillStyle = INK; ctx.font = `600 220px ${SERIF}`; ctx.fillText(fmt(f.score), W / 2, 540);
  ctx.fillStyle = MUTED; ctx.font = `500 44px ${SANS}`; ctx.fillText(`out of ${fmt(TOTAL)}`, W / 2, 615);
  const s = streakInfo().count;
  ctx.fillStyle = INK; ctx.font = `600 40px ${SANS}`;
  ctx.fillText(`${f.beat != null ? `Beat ${f.beat}% of players` : `${fmtKm(f.km)} off in total`}${s > 1 ? `  ·  ${s}-day streak` : ""}`, W / 2, 700);

  // one tile per riddle: colour = how close, number = km off
  const colors = { "🟩": "#4f7d5c", "🟨": "#b89a2e", "🟧": "#c26a2b", "🟥": "#d0402b", "⬛": "#8f8b80" };
  const tw = 172, gap = 16, x0 = (W - (tw * N + gap * (N - 1))) / 2;
  state.rounds.forEach((x, i) => {
    const tx = x0 + i * (tw + gap);
    ctx.fillStyle = colors[roundSquare(x.done.km)]; ctx.beginPath(); ctx.roundRect(tx, 820, tw, 190, 6); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = `600 26px ${SANS}`; ctx.fillText(`Scene ${i + 1}`, tx + tw / 2, 866);
    ctx.fillStyle = "#fff"; ctx.font = `600 52px ${SERIF}`;
    const km = x.done.km;
    ctx.fillText(km < 1000 ? fmt(km) : (km / 1000).toFixed(km < 10000 ? 1 : 0) + "k", tx + tw / 2, 945);
    ctx.font = `500 24px ${SANS}`; ctx.fillText("km off", tx + tw / 2, 983);
  });
  ctx.fillStyle = RULE; ctx.fillRect(80, 1090, W - 160, 1);
  ctx.fillStyle = INK; ctx.font = `600 56px ${SERIF}`;
  ctx.fillText("Can you beat me?", W / 2, 1180);
  ctx.fillStyle = "#c85a1e"; ctx.font = `700 36px ${SANS}`;
  ctx.fillText(location.host || "somewheredaily.com", W / 2, 1245);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

async function rename() {
  const v = $("#name-input").value.trim().slice(0, 20);
  if (!v) return;
  myName = v; store.set("sw:name", v);
  if (!preview && state.final && !state.final.local) {
    try { await fetch("/api/name", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day: DAY, player, name: v }) }); } catch {}
    if (friendCode) friendsPost("join", friendCode).catch(() => {});
  }
  toast("Name saved");
  refreshStats(true);
  loadFriends();
}

/* ---------- live stats ---------- */
async function refreshStats(bust) {
  let s = null;
  if (!preview) {
    try {
      const r = await fetch(`/api/stats?day=${DAY}${bust ? "&t=" + Date.now() : ""}`);
      if (r.ok) s = await r.json(); else if (r.status === 404) preview = true;
    } catch { preview = true; }
  }
  if (!s) { preview = true; s = emptyStats(); }
  $("#preview-banner").hidden = !preview;
  lastStats = s;
  $("#live-count").textContent = fmt(s.players);
  $(".dateline .live").hidden = !s.players;
  renderBoards();
}

/* ---------- friends boards ---------- */
let friendCode = store.get("sw:friends", null);
let friendsData = null;
const inviteLink = () => `${siteUrl() || location.origin}/?friends=${friendCode}`;

async function friendsPost(action, code) {
  const r = await fetch("/api/friends", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, code, player, name: myName }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "failed");
  return j;
}
async function loadFriends() {
  if (!friendCode || preview) return;
  try {
    const r = await fetch(`/api/friends?code=${friendCode}&day=${DAY}&player=${encodeURIComponent(player)}`);
    if (r.ok) { friendsData = await r.json(); renderBoards(); }
  } catch {}
}
// Opening an invite link (?friends=CODE) joins that board.
async function joinFromLink() {
  const code = (params.get("friends") || "").toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) return;
  history.replaceState(null, "", location.pathname + location.hash);
  if (code === friendCode) return;
  if (preview) { toast("Friends boards turn on once the database is connected."); return; }
  try {
    await friendsPost("join", code);
    friendCode = code; store.set("sw:friends", code); friendsData = null;
    toast("You joined a friends board! Play today's 5 places to get on it.");
    track("Join friends board");
    loadFriends();
  } catch (e) { toast(e.message === "no such board" ? "That friends link doesn't work anymore." : "Couldn't join the friends board."); }
}

const HARD_BADGE = ` <span class="hard-badge" title="Cracked today's last (hardest) riddle">Boss</span>`;
function friendsHTML() {
  if (preview) return `<p class="empty-note">Friends boards turn on once the database is connected. Then you can make a private board for you and your friends.</p>`;
  if (!friendCode) return `
    <div class="friends-start">
      <p><b>Play against your friends.</b> Make a private board, send the link to your group chat, and see who gets closest every day.</p>
      <button class="guess small" id="fr-create">Start a friends board</button>
    </div>`;
  const d = friendsData;
  const rows = d ? d.board.map((p, i) => `
      <li class="${p.me ? "me" : ""}">
        <span class="rank">${p.score == null ? "" : i + 1}</span>
        <span class="who">${p.country ? flag(p.country) + " " : ""}${esc(p.name)}${p.me ? " (you)" : ""}${p.cracked ? HARD_BADGE : ""}</span>
        <span class="sub">${p.score == null ? "hasn't played yet" : fmtKm(p.km) + " total"}</span>
        <span class="val">${p.score == null ? "–" : fmt(p.score)}</span>
      </li>`).join("") : `<li class="empty">Loading…</li>`;
  return `
    <div class="invite">
      <span>Invite friends with this link:</span>
      <div class="invite-row"><input readonly value="${esc(inviteLink())}" id="fr-link"><button class="guess small" id="fr-invite">${navigator.share && matchMedia("(pointer: coarse)").matches ? "Share" : "Copy"}</button></div>
    </div>
    <ol class="board">${rows}</ol>
    ${d && d.members === 1 ? `<p class="empty-note">It's just you so far. Send the link to a friend!</p>` : ""}
    <button class="linkish" id="fr-leave">Leave this board</button>`;
}

$("#friends-panel").addEventListener("click", async (e) => {
  const id = e.target.closest("button")?.id;
  if (id === "fr-create") {
    e.target.disabled = true;
    try {
      const { code } = await friendsPost("create");
      friendCode = code; store.set("sw:friends", code); friendsData = null;
      track("Create friends board");
      renderBoards(); loadFriends();
      if (state.final) render(false);
    } catch { toast("Couldn't make the board. Try again in a moment."); e.target.disabled = false; }
  } else if (id === "fr-invite") {
    track("Invite friends");
    copyOrShare(`Play Somewhere with me! Today's 5 places, our own leaderboard:\n${inviteLink()}`, "Invite link copied! Paste it in your group chat.");
  } else if (id === "fr-leave") {
    try { await friendsPost("leave", friendCode); } catch {}
    friendCode = null; friendsData = null; store.set("sw:friends", null);
    renderBoards();
    if (state.final) render(false);
  }
});

/* ---------- drawer ---------- */
function setClues(open) {
  $("#clues").classList.toggle("collapsed", !open);
  $("#clue-toggle").setAttribute("aria-expanded", String(open));
  $("#clue-toggle").setAttribute("aria-label", open ? "Hide clues" : "Show clues");
}
$("#clue-toggle").addEventListener("click", () => setClues($("#clues").classList.contains("collapsed")));

let tab = "players";
function setTab(t) {
  tab = t;
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === t));
  renderBoards();
  if (t === "friends") loadFriends();
}
function openBoards(t) {
  $("#boards").hidden = false;
  setTab(typeof t === "string" ? t : tab);
  track("Open leaderboard", { tab });
}
$("#boards-btn").addEventListener("click", () => openBoards());
$("#boards-close").addEventListener("click", () => { $("#boards").hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#boards").hidden = true; });
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

function renderBoards() {
  const s = lastStats; if (!s) return;
  for (const t of ["players", "countries", "feed"]) $("#board-" + t).hidden = t !== tab;
  $("#friends-panel").hidden = tab !== "friends";
  const meta = $("#board-meta");
  const empty = (msg) => `<li class="empty">${msg}</li>`;

  if (tab === "friends") {
    meta.textContent = friendCode && friendsData ? `Your friends board · today's 5 places` : "";
    $("#friends-panel").innerHTML = friendsHTML();
  } else if (tab === "players") {
    meta.textContent = s.players ? `${fmt(s.players)} players today · average ${fmt(s.avgScore)} / ${fmt(TOTAL)}${s.cracked != null ? ` · ${fmt(s.cracked)} cracked the last riddle` : ""}` : "";
    const mine = state.final && !CUSTOM ? state.final : null;
    $("#board-players").innerHTML = s.top.length ? s.top.map((p, i) => `
      <li class="${mine && p.name === myName && p.score === mine.score ? "me" : ""}">
        <span class="rank">${i + 1}</span>
        <span class="who">${flag(p.country)} ${esc(p.name)}${p.cracked ? HARD_BADGE : ""}</span>
        <span class="sub">${fmtKm(p.km)} total</span>
        <span class="val">${fmt(p.score)}</span>
      </li>`).join("") : empty("No one has played yet today. Be the first!");
  } else if (tab === "countries") {
    const min = s.players >= 50 ? 3 : 1;
    const rows = s.countries.filter((c) => c.n >= min).sort((a, b) => b.avg - a.avg).slice(0, 25);
    meta.textContent = `Average score by country${min > 1 ? ` (${min}+ players)` : ""}. Play to help your country climb.`;
    $("#board-countries").innerHTML = rows.length ? rows.map((c, i) => `
      <li><span class="rank">${i + 1}</span>
        <span class="who">${flag(c.c)} ${esc(countryName(c.c))}</span>
        <span class="sub">${fmt(c.n)} player${c.n > 1 ? "s" : ""}</span>
        <span class="val">${fmt(c.avg)}</span></li>`).join("") : empty("No countries yet.");
  } else {
    meta.textContent = "Latest players";
    $("#board-feed").innerHTML = s.recent.length ? s.recent.map((p) => `
      <li><span class="who">${flag(p.country)} <b>${esc(p.name)}</b> <span class="sub">scored</span></span>
        <span class="val">${fmt(p.score)}</span></li>`).join("") : empty("Waiting for the first explorer…");
  }
}

/* ---------- riddle maker ---------- */
let making = false, makerPin = null;
const maker = $("#maker");
function openMaker() {
  try { help.close(); } catch {}
  if (!$("#mk-by").value) $("#mk-by").value = myName;
  $("#mk-result").hidden = true;
  maker.showModal();
  track("Open riddle maker");
}
$("#make-open").addEventListener("click", openMaker);
$("#mk-cancel").addEventListener("click", () => maker.close());
$("#mk-pick").addEventListener("click", () => {
  maker.close();
  making = true;
  document.body.classList.add("making");
  $("#maker-bar").hidden = false;
  $("#mk-done").disabled = !makerPin;
  $("#boards").hidden = true;
  drawAll();
  resetZoom(true);
});
function makerClick(ll) {
  makerPin = ll;
  drawAnswer();
  $("#mk-done").disabled = false;
}
$("#mk-done").addEventListener("click", () => {
  making = false;
  document.body.classList.remove("making");
  $("#maker-bar").hidden = true;
  $("#mk-spot-label").textContent = `Spot picked (${makerPin[0].toFixed(2)}, ${makerPin[1].toFixed(2)})`;
  render(false);
  if (view() === "guess") resetZoom(false);
  maker.showModal();
});
$("#maker-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!makerPin) { toast("Pick the spot on the map first."); return; }
  const obj = {
    n: $("#mk-name").value.trim(), la: makerPin[0], lo: makerPin[1],
    c: [$("#mk-c1").value, $("#mk-c2").value, $("#mk-c3").value].map((s) => s.trim()).filter(Boolean),
    f: $("#mk-fact").value.trim(), b: $("#mk-by").value.trim() || myName,
  };
  $("#mk-link").value = `${siteUrl() || location.origin}/#r=${encodeRiddle(obj)}`;
  $("#mk-result").hidden = false;
  $("#mk-link").select();
  $("#mk-result").scrollIntoView({ block: "nearest" });
  track("Create riddle", { clues: obj.c.length });
});
$("#mk-share").addEventListener("click", () => {
  copyOrShare(`I wrote you a Somewhere riddle. Can you find the place?\n${$("#mk-link").value}`, "Link copied! Send it to your friends.");
});

/* ---------- feedback & settings ---------- */
$("#feedback-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#fb-msg").value.trim();
  if (!msg) return;
  if (preview) { toast("Feedback turns on once the database is connected."); return; }
  try {
    const r = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ msg, contact: $("#fb-contact").value }) });
    if (!r.ok) throw 0;
    $("#fb-msg").value = ""; $("#fb-contact").value = "";
    toast("Thanks! We read every message.");
    track("Send feedback");
  } catch { toast("Couldn't send right now. Try again later."); }
});

$("#streamer-toggle").checked = streamer;
$("#streamer-toggle").addEventListener("change", (e) => {
  streamer = e.target.checked; store.set("sw:streamer", streamer);
  spoilerOpen = false;
  document.body.classList.toggle("streamer", streamer);
  track("Streamer mode", { on: streamer });
  render(false);
});
document.body.classList.toggle("streamer", streamer);

/* ---------- before the database is connected: empty boards, never made-up players ---------- */
function emptyStats() {
  return { day: DAY, live: true, players: 0, avgKm: null, avgScore: null, cracked: 0, top: [], recent: [], countries: [] };
}

/* ---------- speed clock ---------- */
const secsOn = (r) => Math.max(0, Math.round((Date.now() - (r.shown || Date.now())) / 1000));
const fmtSecs = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
function drawClock() {
  const el = $("#clock");
  if (!el) return;
  const r = cur();
  if (!r || r.done || state.final || !r.shown) { el.innerHTML = ""; return; }
  const t = secsOn(r), f = speedFactor(t);
  el.classList.toggle("fading", t > SPEED.full);
  el.innerHTML = `<b>${fmtSecs(t)}</b><small>${f >= 1 ? "Full speed bonus" : f > 0 ? `Speed bonus ${Math.round(f * 100)}%` : "No speed bonus"}</small>`;
}
setInterval(drawClock, 1000);

/* ---------- countdown & help ---------- */
function tick() {
  const ms = Math.max(0, nextPuzzleAt() - Date.now());
  const el = $("#countdown");
  if (el) {
    const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
    el.textContent = [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  }
  // A new day started: load the new puzzle, but never in the middle of someone's game.
  const idle = state.final || (state.round === 0 && !cur().done && !cur().pin);
  if (!DEV && !CUSTOM && !tick.reloaded && dayNumber() !== DAY && idle) { tick.reloaded = true; setTimeout(() => location.reload(), 1500); }
}
setInterval(tick, 1000);

const help = $("#help");
$("#help-btn").addEventListener("click", () => help.showModal());
$("#help-close").addEventListener("click", () => help.close());
// No how-to popup on the first visit: the first screen teaches itself (see "first look").
store.set("sw:seenHelp2", true);
if (CUSTOM && view() === "guess" && !state.rounds[0].pin) toast(`${CUSTOM.by} wrote you a riddle. Find the place!`);

/* ---------- start ---------- */
renderClues();
updateLock();
await initMap();
startClock();
await refreshStats();
render(false);
if (view() === "guess" && cur().pin) $("#map-hint").style.opacity = 0;
joinFromLink();
loadFriends();
setInterval(() => { if (!document.hidden) refreshStats(); }, 20000);
setInterval(() => { if (!document.hidden && !$("#boards").hidden && tab === "friends") loadFriends(); }, 30000);

/* ---------- tester mode bar ---------- */
if (DEV) {
  const bar = document.createElement("div");
  bar.className = "dev-bar";
  const opt = (d) => `<option value="${d}"${d === DAY ? " selected" : ""}>No. ${d} · ${dateFor(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</option>`;
  bar.innerHTML = `<b>Tester mode</b><span>Not counted on the leaderboard</span>
    <select id="dev-day" aria-label="Pick a day">${DEV_DAYS.map(opt).join("")}</select>
    <button id="dev-reset">Play again</button><a href="/">Exit</a>`;
  document.body.appendChild(bar);
  $("#dev-day").addEventListener("change", (e) => { location.search = `?dev&day=${e.target.value}`; });
  $("#dev-reset").addEventListener("click", () => { try { localStorage.removeItem(STATE_KEY); } catch {} location.reload(); });
}
