// Somewhere: the browser side of the game.
import {
  dayNumber, nextPuzzleAt, puzzleFor, distanceKm, scoreFor, proximitySquares,
  CLUE_MULT, MAX_CLUES, MAX_POINTS,
} from "./game.js";

const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const fmtKm = (km) => (km < 10 ? km.toFixed(1) : fmt(km)) + " km";

/* ---------- storage (wrapped: private windows can throw) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const DAY = dayNumber();
const PUZ = puzzleFor(DAY);
const STATE_KEY = `sw:day:${DAY}`;
const state = store.get(STATE_KEY, null) || { clues: 1, pin: null, started: Date.now(), result: null };
const save = () => store.set(STATE_KEY, state);
save();

let player = store.get("sw:player", null);
if (!player) {
  player = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  store.set("sw:player", player);
}
let myName = store.get("sw:name", null);
if (!myName) { myName = randomName(); store.set("sw:name", myName); }

let preview = location.protocol === "file:";
let lastStats = null;
let crowdPins = [];

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

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- clues ---------- */
function renderClues(animateLast = false) {
  $("#day-label").textContent = `#${DAY}`;
  const list = $("#clue-list");
  const n = state.result ? state.result.clues : state.clues;
  const shown = state.result ? MAX_CLUES : n;
  list.innerHTML = "";
  for (let i = 0; i < shown; i++) {
    const li = document.createElement("li");
    li.dataset.n = i + 1;
    li.textContent = PUZ.clues[i];
    if (animateLast && i === shown - 1) li.className = "reveal";
    if (state.result && i >= n) li.classList.add("unused");
    if (i === n - 1) li.classList.add("current");
    list.appendChild(li);
  }
  $("#clue-count").textContent = state.result ? `You used ${n} of ${MAX_CLUES} clues` : `Clue ${n} of ${MAX_CLUES}`;
  $("#mult").textContent = `Points ×${CLUE_MULT[n - 1].toFixed(2).replace(/0$/, "")}`;
  const btn = $("#next-clue");
  btn.hidden = !!state.result || n >= MAX_CLUES;
  if (n < MAX_CLUES) $("#next-cost").textContent = `(points ×${CLUE_MULT[n].toFixed(2).replace(/0$/, "")})`;
}

$("#next-clue").addEventListener("click", () => {
  if (state.result || state.clues >= MAX_CLUES) return;
  state.clues++; save(); renderClues(true);
  track("Reveal clue", { clue: state.clues, day: DAY });
});

/* ---------- map ---------- */
const map = { svg: null, root: null, projection: null, path: null, zoom: null, k: 1, land: null };

async function initMap() {
  const topo = await fetch("vendor/countries-50m.json").then((r) => r.json());
  map.land = topojson.feature(topo, topo.objects.countries);
  buildMap();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(buildMap, 200); });
}

function buildMap() {
  const el = $("#map");
  el.innerHTML = "";
  const W = el.clientWidth, H = el.clientHeight;
  map.projection = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" });
  map.path = d3.geoPath(map.projection);
  map.svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  map.root = map.svg.append("g");
  map.root.append("path").attr("class", "sphere").attr("d", map.path({ type: "Sphere" }));
  map.root.append("path").attr("class", "graticule").attr("d", map.path(d3.geoGraticule10()));
  map.root.append("g").selectAll("path").data(map.land.features).join("path").attr("class", "land").attr("d", map.path);
  for (const id of ["players", "crowd", "line", "answer", "mine"]) map.root.append("g").attr("id", "layer-" + id);

  map.k = 1;
  map.zoom = d3.zoom().scaleExtent([1, 80]).translateExtent([[0, 0], [W, H]]).clickDistance(6)
    .on("zoom", (e) => { map.root.attr("transform", e.transform); map.k = e.transform.k; rescaleMarkers(); });
  map.svg.call(map.zoom).on("dblclick.zoom", null);
  map.svg.on("click", onMapClick);
  drawAll();
  if (state.result) fitToResult(false);
  else {
    // On tall/narrow screens the flat world is a thin strip; zoom in so it fills the box.
    const [[, y0], [, y1]] = map.path.bounds({ type: "Sphere" });
    const k = Math.min(2.6, H / (y1 - y0));
    if (k > 1.15) {
      const [cx, cy] = map.projection([10, 15]);
      map.svg.call(map.zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-cx, -cy));
    }
  }
}

function onMapClick(e) {
  if (state.result) return;
  const [x, y] = d3.pointer(e, map.root.node());
  const ll = map.projection.invert([x, y]);
  if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return;
  const back = map.projection(ll);
  if (!back || Math.hypot(back[0] - x, back[1] - y) > 1) return; // clicked outside the globe
  if (!state.pin) track("First pin", { clues: state.clues, day: DAY });
  state.pin = [Math.round(ll[1] * 1e4) / 1e4, Math.round(ll[0] * 1e4) / 1e4];
  save();
  drawMine();
  $("#map-hint").style.opacity = 0;
  updateLock();
}

const pt = (lat, lon) => map.projection([lon, lat]);
function rescaleMarkers() {
  const s = 1 / map.k;
  map.root.selectAll(".marker").attr("transform", function () {
    return `translate(${this.dataset.x},${this.dataset.y}) scale(${s})`;
  });
}
function marker(layer, data, draw) {
  const g = map.root.select("#layer-" + layer);
  const sel = g.selectAll("g.marker").data(data).join("g").attr("class", "marker")
    .each(function (d) { const [x, y] = pt(d[0], d[1]); this.dataset.x = x; this.dataset.y = y; });
  sel.selectAll("*").remove();
  draw(sel);
  rescaleMarkers();
}

function drawPlayers() {
  const where = state.result ? [] : (lastStats?.where || []);
  marker("players", where, (sel) => sel.append("circle").attr("class", "player-dot")
    .attr("r", (d) => 2.2 + Math.min(9, Math.sqrt(d[2]) * 1.1)));
}
function drawCrowd() {
  const pins = state.result ? crowdPins : [];
  marker("crowd", pins, (sel) => sel.append("circle").attr("class", "crowd-dot").attr("r", 2.6));
}
function drawMine() {
  const pin = state.result ? [state.result.glat, state.result.glon] : state.pin;
  marker("mine", pin ? [pin] : [], (sel) => {
    sel.append("path").attr("class", "my-pin").attr("stroke-width", 1.5)
      .attr("d", "M0,0 C-2,-6 -8,-9 -8,-15 A8,8 0 1 1 8,-15 C8,-9 2,-6 0,0Z");
    sel.append("circle").attr("cy", -15).attr("r", 3).attr("fill", "#fff");
  });
}
function drawAnswer() {
  const r = state.result;
  map.root.select("#layer-line").selectAll("path").data(r ? [1] : []).join("path").attr("class", "guess-line")
    .attr("d", () => map.path({ type: "LineString", coordinates: [[r.glon, r.glat], [PUZ.lon, PUZ.lat]] }));
  marker("answer", r ? [[PUZ.lat, PUZ.lon]] : [], (sel) => {
    sel.append("circle").attr("r", 18).attr("fill", "var(--answer)").attr("fill-opacity", .25);
    sel.append("path").attr("class", "answer-pin").attr("stroke-width", 1.2)
      .attr("d", d3.symbol(d3.symbolStar, 260)());
  });
}
function drawAll() { drawPlayers(); drawCrowd(); drawAnswer(); drawMine(); renderLegend(); }

function renderLegend() {
  $("#legend").innerHTML = state.result
    ? `<span><i style="background:var(--pin)"></i>You</span><span><i style="background:var(--answer)"></i>Answer</span><span><i style="background:var(--crowd)"></i>Everyone's guesses</span>`
    : `<span><i style="background:var(--players)"></i>Where people are playing today</span>`;
}

function fitToResult(animate = true) {
  const r = state.result;
  const W = +map.svg.attr("viewBox").split(" ")[2], H = +map.svg.attr("viewBox").split(" ")[3];
  const [[x0, y0], [x1, y1]] = map.path.bounds({ type: "LineString", coordinates: [[r.glon, r.glat], [PUZ.lon, PUZ.lat]] });
  // Only the part of the screen above the result sheet (and below the top bar) is visible.
  const sheet = $("#result");
  const sheetH = sheet && !sheet.hidden ? sheet.offsetHeight + 20 : 0;
  const top = 70, visH = Math.max(140, H - sheetH - top);
  const pad = 80;
  const k = Math.max(1, Math.min(5, 0.9 / Math.max((x1 - x0 + pad) / W, (y1 - y0 + pad) / visH)));
  const t = d3.zoomIdentity.translate(W / 2, top + visH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  (animate ? map.svg.transition().duration(1200) : map.svg).call(map.zoom.transform, t);
}

$("#zoom-in").addEventListener("click", () => map.svg.transition().duration(250).call(map.zoom.scaleBy, 2));
$("#zoom-out").addEventListener("click", () => map.svg.transition().duration(250).call(map.zoom.scaleBy, 0.5));

/* ---------- lock in ---------- */
function updateLock() {
  const btn = $("#lock-btn");
  $("#lock-bar").hidden = !!state.result;
  btn.disabled = !state.pin;
  btn.textContent = state.pin ? "GUESS" : "Place your pin on the map";
}

$("#lock-btn").addEventListener("click", async () => {
  if (!state.pin || state.result) return;
  const btn = $("#lock-btn");
  btn.disabled = true; btn.textContent = "Checking…";
  const [lat, lon] = state.pin;
  const ms = Date.now() - state.started;
  let res = null;
  if (!preview) {
    try {
      const r = await fetch("/api/play", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ day: DAY, player, name: myName, lat, lon, clues: state.clues, ms }),
      });
      if (r.ok) res = await r.json();
    } catch {}
  }
  if (!res) {
    const km = Math.round(distanceKm(lat, lon, PUZ.lat, PUZ.lon) * 10) / 10;
    const score = scoreFor(km, state.clues);
    const players = lastStats?.players || 1;
    res = { glat: lat, glon: lon, clues: state.clues, km, score, players, beat: estimateBeat(score), local: true };
    if (!preview) toast("Couldn't reach the server. Your result is saved on this device.");
  }
  state.result = { glat: res.glat, glon: res.glon, clues: res.clues, km: res.km, score: res.score, beat: res.beat, players: res.players };
  save();
  track("Lock in", { clues: res.clues, distance: kmBucket(res.km), day: DAY, offline: !!res.local });
  recordHistory();
  renderClues();
  showResult(true);
  loadPins();
  refreshStats();
});

function estimateBeat(score) {
  // Preview mode only: a rough guess from the average.
  const avg = lastStats?.avgScore || 1800;
  return Math.max(1, Math.min(99, Math.round(50 + (score - avg) / 40)));
}

function recordHistory() {
  const h = store.get("sw:history", {});
  h[DAY] = state.result.score;
  store.set("sw:history", h);
}
function streak() {
  const h = store.get("sw:history", {});
  let s = 0;
  for (let d = DAY; h[d] != null; d--) s++;
  return s;
}

/* ---------- result ---------- */
function showResult(animate) {
  const r = state.result;
  $("#result").hidden = false;
  $("#answer-name").textContent = PUZ.name;
  $("#r-km").textContent = fmtKm(r.km);
  $("#r-score").textContent = fmt(r.score);
  $("#r-beat").textContent = r.beat + "%";
  $("#r-squares").textContent = proximitySquares(r.km);
  $("#r-fact").textContent = PUZ.fact;
  $("#name-input").value = myName;
  $("#streak").textContent = streak();
  updateLock();
  drawAll();
  $("#map-hint").hidden = true;
  if (matchMedia("(max-width: 640px)").matches) setClues(false);
  requestAnimationFrame(() => {
    fitToResult(animate);
    $("#r-bar").style.width = (r.score / MAX_POINTS * 100).toFixed(1) + "%";
  });
}

function shareText() {
  const r = state.result;
  return [
    `Somewhere #${DAY} 🌍`,
    `🔎 ${r.clues}/${MAX_CLUES} clues`,
    `📍 ${fmtKm(r.km)} off`,
    `${proximitySquares(r.km)} ${fmt(r.score)} pts`,
    `Beat ${r.beat}% of the world`,
    location.origin.startsWith("http") ? location.origin : "",
  ].filter(Boolean).join("\n");
}

$("#share-btn").addEventListener("click", async () => {
  const text = shareText();
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); toast("Copied! Paste it anywhere."); }
  catch { prompt("Copy your result:", text); }
});

$("#card-btn").addEventListener("click", async () => {
  const blob = await makeCard();
  const file = new File([blob], `somewhere-${DAY}.png`, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ files: [file], text: shareText() }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

// A 1080x1350 image card with a mini map of your guess. Great for stories.
async function makeCard() {
  const r = state.result, W = 1080, H = 1350;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  await document.fonts.ready;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#e3f0f8");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#f5b301"; ctx.beginPath(); ctx.arc(102, 116, 22, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(102, 116, 13, 0, 7); ctx.fill(); ctx.fillStyle = "#e5484d"; ctx.beginPath(); ctx.arc(102, 116, 7, 0, 7); ctx.fill();
  ctx.fillStyle = "#17202e"; ctx.font = "800 64px 'Bricolage Grotesque', Inter, sans-serif"; ctx.fillText("Somewhere", 140, 136);
  ctx.fillStyle = "#5d6878"; ctx.font = "700 40px Inter, sans-serif"; ctx.textAlign = "right"; ctx.fillText(`#${DAY}`, W - 80, 130); ctx.textAlign = "left";

  // mini map
  const mx = 60, my = 190, mw = W - 120, mh = 600;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 32); ctx.clip();
  ctx.fillStyle = "#cfe6f3"; ctx.fillRect(mx, my, mw, mh);
  const line = { type: "LineString", coordinates: [[r.glon, r.glat], [PUZ.lon, PUZ.lat]] };
  const proj = d3.geoNaturalEarth1().fitExtent([[mx, my], [mx + mw, my + mh]], { type: "Sphere" });
  const b = d3.geoPath(proj).bounds(line);
  const k = Math.max(1, Math.min(10, 0.8 / Math.max((b[1][0] - b[0][0] + 80) / mw, (b[1][1] - b[0][1] + 80) / mh)));
  const cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
  proj.scale(proj.scale() * k).translate([
    mx + mw / 2 - (cx - proj.translate()[0]) * k, my + mh / 2 - (cy - proj.translate()[1]) * k,
  ]);
  const path = d3.geoPath(proj, ctx);
  ctx.beginPath(); path(map.land); ctx.fillStyle = "#f1efe4"; ctx.fill();
  ctx.strokeStyle = "#c9c3ad"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); path(line); ctx.setLineDash([14, 10]); ctx.strokeStyle = "#17202e"; ctx.lineWidth = 5; ctx.stroke(); ctx.setLineDash([]);
  const [ax, ay] = proj([PUZ.lon, PUZ.lat]), [gx, gy] = proj([r.glon, r.glat]);
  ctx.fillStyle = "#f5b301"; ctx.strokeStyle = "#5b4300"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ax, ay, 17, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e5484d"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(gx, gy, 15, 0, 7); ctx.fill(); ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#17202e"; ctx.font = "800 150px 'Bricolage Grotesque', Inter, sans-serif"; ctx.fillText(fmtKm(r.km), W / 2, 980);
  ctx.fillStyle = "#5d6878"; ctx.font = "600 42px Inter, sans-serif";
  ctx.fillText(`${fmt(r.score)} pts  ·  ${r.clues}/${MAX_CLUES} clues  ·  beat ${r.beat}%`, W / 2, 1060);
  // proximity bar
  const sq = proximitySquares(r.km), colors = { "🟩": "#19a463", "🟨": "#f5b301", "🟧": "#f08a24", "⬛": "#dfe4ea" };
  [...sq].forEach((ch, i) => { ctx.fillStyle = colors[ch] || "#dfe4ea"; ctx.beginPath(); ctx.roundRect(W / 2 - 290 + i * 120, 1110, 100, 40, 12); ctx.fill(); });
  ctx.fillStyle = "#17202e"; ctx.font = "700 46px Inter, sans-serif";
  ctx.fillText("Can you find today's place?", W / 2, 1240);
  ctx.fillStyle = "#12814d"; ctx.font = "800 36px Inter, sans-serif";
  ctx.fillText(location.host || "somewhere", W / 2, 1295);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

$("#name-save").addEventListener("click", async () => {
  const v = $("#name-input").value.trim().slice(0, 20);
  if (!v) return;
  myName = v; store.set("sw:name", v);
  if (!preview && state.result) {
    try { await fetch("/api/name", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day: DAY, player, name: v }) }); } catch {}
  }
  toast("Name saved");
  refreshStats(true);
});

/* ---------- live stats ---------- */
async function refreshStats(bust) {
  let s = null;
  if (!preview) {
    try {
      const r = await fetch(`/api/stats?day=${DAY}${bust ? "&t=" + Date.now() : ""}`);
      if (r.ok) s = await r.json(); else if (r.status === 404) preview = true;
    } catch { preview = true; }
  }
  if (!s) { preview = true; s = sampleStats(); }
  $("#preview-banner").hidden = !preview;
  lastStats = s;
  $("#live-count").textContent = fmt(s.players);
  drawPlayers();
  renderBoards();
}

async function loadPins() {
  if (!state.result) return;
  if (preview) { crowdPins = samplePins(); drawCrowd(); return; }
  try {
    const r = await fetch(`/api/pins?day=${DAY}&player=${encodeURIComponent(player)}`);
    if (r.ok) { crowdPins = (await r.json()).pins; drawCrowd(); }
  } catch {}
}

function setClues(open) {
  $("#clues").classList.toggle("collapsed", !open);
  $("#clue-toggle").setAttribute("aria-expanded", String(open));
  $("#clue-toggle").setAttribute("aria-label", open ? "Hide clues" : "Show clues");
}
$("#clue-toggle").addEventListener("click", () => setClues($("#clues").classList.contains("collapsed")));
const openBoards = () => { $("#boards").hidden = false; renderBoards(); };
$("#boards-btn").addEventListener("click", openBoards);
$("#result-boards").addEventListener("click", openBoards);
$("#boards-close").addEventListener("click", () => { $("#boards").hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#boards").hidden = true; });

let tab = "players";
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
  tab = b.dataset.tab;
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
  renderBoards();
}));

function renderBoards() {
  const s = lastStats; if (!s) return;
  for (const t of ["players", "countries", "feed"]) $("#board-" + t).hidden = t !== tab;
  const meta = $("#board-meta");
  const empty = (msg) => `<li class="empty">${msg}</li>`;

  if (tab === "players") {
    meta.textContent = s.players ? `${fmt(s.players)} players today · average guess ${fmt(s.avgKm)} km off` : "";
    const mine = state.result;
    $("#board-players").innerHTML = s.top.length ? s.top.map((p, i) => `
      <li class="${mine && p.name === myName && p.score === mine.score ? "me" : ""}">
        <span class="rank">${i + 1}</span>
        <span class="who">${flag(p.country)} ${esc(p.name)}</span>
        <span class="sub">${fmtKm(p.km)} · ${p.clues} clue${p.clues > 1 ? "s" : ""}</span>
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

/* ---------- preview data (only used before the backend is deployed) ---------- */
function seeded(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const CITIES = [[40.7, -74], [34, -118.2], [41.9, -87.6], [19.4, -99.1], [-23.5, -46.6], [-34.6, -58.4], [4.7, -74.1], [51.5, -0.1],
  [48.9, 2.4], [52.5, 13.4], [40.4, -3.7], [41.9, 12.5], [55.8, 37.6], [30, 31.2], [6.5, 3.4], [-1.3, 36.8], [-26.2, 28], [25.2, 55.3],
  [28.6, 77.2], [19.1, 72.9], [13.8, 100.5], [1.35, 103.8], [-6.2, 106.8], [14.6, 121], [35.7, 139.7], [37.6, 127], [31.2, 121.5],
  [-33.9, 151.2], [-37.8, 145], [43.7, -79.4], [45.5, -73.6], [59.3, 18.1], [50.1, 14.4], [39.9, 32.9], [33.7, 73.1], [23.8, 90.4]];
const CC = ["US", "US", "US", "MX", "BR", "AR", "CO", "GB", "FR", "DE", "ES", "IT", "PL", "EG", "NG", "KE", "ZA", "AE", "IN", "IN", "TH", "SG", "ID", "PH", "JP", "KR", "CN", "AU", "AU", "CA", "CA", "SE", "CZ", "TR", "PK", "BD"];
function sampleStats() {
  const rnd = seeded(DAY * 7919);
  const where = [], countries = {}, names = ["Mira", "Kenji", "Lola", "Tariq", "Ana", "Jonas", "Priya", "Sam", "Wei", "Chloe", "Diego", "Amara", "Leo", "Yuki", "Omar", "Ines"];
  let players = 0;
  CITIES.forEach(([la, lo], i) => {
    const n = 8 + Math.floor(rnd() * 90);
    players += n;
    for (let j = 0; j < 4; j++) where.push([la + (rnd() - .5) * 3, lo + (rnd() - .5) * 3, Math.ceil(n / (j + 1) / 2)]);
    const c = countries[CC[i]] || (countries[CC[i]] = { c: CC[i], n: 0, sum: 0 });
    c.n += n; c.sum += n * (900 + rnd() * 2600);
  });
  const top = Array.from({ length: 15 }, (_, i) => {
    const km = Math.round((2 + i * i * 9 + rnd() * 20) * 10) / 10, clues = 1 + Math.floor(i / 4);
    return { name: names[i % names.length] + " " + "ABCDEFGHJKLMNPRS"[Math.floor(rnd() * 16)] + ".", country: CC[Math.floor(rnd() * CC.length)], km, clues, score: scoreFor(km, clues) };
  }).sort((a, b) => b.score - a.score);
  const recent = Array.from({ length: 8 }, () => ({ name: names[Math.floor(rnd() * names.length)], country: CC[Math.floor(rnd() * CC.length)], score: Math.floor(rnd() * MAX_POINTS) }));
  return {
    day: DAY, live: true, players, avgKm: 2140, avgScore: 1800, clueDist: [10, 22, 30, 20, 18], top, recent, where,
    countries: Object.values(countries).map((c) => ({ c: c.c, n: c.n, avg: Math.round(c.sum / c.n) })),
  };
}
function samplePins() {
  const rnd = seeded(DAY * 104729), pins = [];
  for (let i = 0; i < 600; i++) {
    const spread = rnd() < 0.55 ? 6 : rnd() < 0.7 ? 25 : 80;
    const lat = Math.max(-85, Math.min(85, PUZ.lat + (rnd() - .5) * spread));
    const lon = ((PUZ.lon + (rnd() - .5) * spread * 1.6 + 540) % 360) - 180;
    pins.push([lat, lon, 0]);
  }
  return pins;
}

/* ---------- countdown & help ---------- */
function tick() {
  const ms = Math.max(0, nextPuzzleAt() - Date.now());
  const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
  $("#countdown").textContent = [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  if (ms === 0 && !tick.reloaded) { tick.reloaded = true; setTimeout(() => location.reload(), 1500); }
}
setInterval(tick, 1000); tick();

const help = $("#help");
$("#help-btn").addEventListener("click", () => help.showModal());
$("#help-close").addEventListener("click", () => help.close());
if (!store.get("sw:seenHelp", false)) { store.set("sw:seenHelp", true); try { help.showModal(); } catch {} }

/* ---------- start ---------- */
renderClues();
updateLock();
await initMap();
await refreshStats();
if (state.result) { showResult(false); loadPins(); }
else if (state.pin) { $("#map-hint").style.opacity = 0; }
setInterval(() => { if (!document.hidden) refreshStats(); }, 20000);
setInterval(() => { if (!document.hidden && state.result) loadPins(); }, 60000);
