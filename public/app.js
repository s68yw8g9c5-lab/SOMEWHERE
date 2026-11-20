// Somewhere: the browser side of the game. 5 places a day, 3 clues each.
import {
  dayNumber, nextPuzzleAt, puzzlesFor, distanceKm, scoreFor, roundSquare,
  CLUE_MULT, MAX_CLUES, MAX_POINTS, MAX_TOTAL, ROUNDS,
} from "./game.js";

const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(Number(n)).toLocaleString("en-US");
const fmtKm = (km) => (km = Number(km), (km < 10 ? km.toFixed(1) : fmt(km)) + " km");
const multTxt = (n) => "×" + CLUE_MULT[n - 1].toFixed(2).replace(/0$/, "");

/* ---------- storage (wrapped: private windows can throw) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const DAY = dayNumber();
const PUZ = puzzlesFor(DAY);
const STATE_KEY = `sw:game:${DAY}`;
const fresh = () => ({
  round: 0, started: Date.now(), final: null,
  rounds: Array.from({ length: ROUNDS }, () => ({ clues: 1, pin: null, done: null })),
});
let state = store.get(STATE_KEY, null);
if (!state || !Array.isArray(state.rounds) || state.rounds.length !== ROUNDS) state = fresh();
const save = () => store.set(STATE_KEY, state);
save();

const cur = () => state.rounds[state.round];
const curPuz = () => PUZ[state.round];
// "guess" = pin dropping, "round" = one round's answer, "final" = the day's summary.
const view = () => state.final ? "final" : cur().done ? "round" : "guess";
const doneRounds = () => state.rounds.filter((r) => r.done);
const runningTotal = () => doneRounds().reduce((s, r) => s + r.done.score, 0);

let player = store.get("sw:player", null);
if (!player) {
  player = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  store.set("sw:player", player);
}
let myName = store.get("sw:name", null);
if (!myName) { myName = randomName(); store.set("sw:name", myName); }

let preview = location.protocol === "file:";
let lastStats = null;
let crowdPins = [];   // 5 lists of [lat, lon, score]

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
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- clues ---------- */
function renderClues(animateLast = false) {
  $("#day-label").textContent = `#${DAY}`;
  const v = view();
  $("#clues").hidden = v === "final";
  if (v === "final") return;
  const r = cur(), p = curPuz();
  const n = r.done ? r.done.clues : r.clues;
  const shown = r.done ? MAX_CLUES : n;
  const list = $("#clue-list");
  list.innerHTML = "";
  for (let i = 0; i < shown; i++) {
    const li = document.createElement("li");
    li.dataset.n = i + 1;
    li.textContent = p.clues[i];
    if (animateLast && i === shown - 1) li.className = "reveal";
    if (r.done && i >= n) li.classList.add("unused");
    if (i === n - 1) li.classList.add("current");
    list.appendChild(li);
  }
  $("#round-label").textContent = `Round ${state.round + 1}/${ROUNDS}`;
  $("#total-label").textContent = `${fmt(runningTotal())} pts`;
  $("#clue-count").textContent = r.done ? `${n} of ${MAX_CLUES} clues used` : `Clue ${n} of ${MAX_CLUES}`;
  $("#mult").textContent = `Points ${multTxt(n)}`;
  $("#next-clue").hidden = !!r.done || n >= MAX_CLUES;
  if (n < MAX_CLUES) $("#next-cost").textContent = `(points ${multTxt(n + 1)})`;
}

$("#next-clue").addEventListener("click", () => {
  const r = cur();
  if (r.done || r.clues >= MAX_CLUES) return;
  r.clues++; save(); renderClues(true);
  track("Reveal clue", { clue: r.clues, round: state.round + 1, day: DAY });
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
  if (view() !== "guess") fitToResult(false);
  else resetZoom(false);
}

// On tall/narrow screens the flat world is a thin strip; zoom in so it fills the box.
function resetZoom(animate) {
  const W = +map.svg.attr("viewBox").split(" ")[2], H = +map.svg.attr("viewBox").split(" ")[3];
  const [[, y0], [, y1]] = map.path.bounds({ type: "Sphere" });
  const k = Math.min(2.6, H / (y1 - y0));
  let t = d3.zoomIdentity;
  if (k > 1.15) {
    const [cx, cy] = map.projection([10, 15]);
    t = d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-cx, -cy);
  }
  (animate ? map.svg.transition().duration(700) : map.svg).call(map.zoom.transform, t);
}

function onMapClick(e) {
  if (view() !== "guess") return;
  const [x, y] = d3.pointer(e, map.root.node());
  const ll = map.projection.invert([x, y]);
  if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return;
  const back = map.projection(ll);
  if (!back || Math.hypot(back[0] - x, back[1] - y) > 1) return; // clicked outside the globe
  const r = cur();
  if (!r.pin && state.round === 0) track("First pin", { clues: r.clues, day: DAY });
  r.pin = [Math.round(ll[1] * 1e4) / 1e4, Math.round(ll[0] * 1e4) / 1e4];
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

// Which rounds have their answer on the map right now.
function revealed() {
  const v = view();
  if (v === "final") return state.rounds.map((r, i) => i).filter((i) => state.rounds[i].done);
  if (v === "round") return [state.round];
  return [];
}

function drawPlayers() {
  const where = view() === "guess" ? (lastStats?.where || []) : [];
  marker("players", where, (sel) => sel.append("circle").attr("class", "player-dot")
    .attr("r", (d) => 2.2 + Math.min(9, Math.sqrt(d[2]) * 1.1)));
}
function drawCrowd() {
  const pins = view() === "final" ? crowdPins.flat() : [];
  marker("crowd", pins, (sel) => sel.append("circle").attr("class", "crowd-dot").attr("r", 2.4));
}
function drawMine() {
  const pins = view() === "guess"
    ? (cur().pin ? [cur().pin] : [])
    : revealed().map((i) => [state.rounds[i].done.glat, state.rounds[i].done.glon]);
  marker("mine", pins, (sel) => {
    sel.append("path").attr("class", "my-pin").attr("stroke-width", 1.5)
      .attr("d", "M0,0 C-2,-6 -8,-9 -8,-15 A8,8 0 1 1 8,-15 C8,-9 2,-6 0,0Z");
    sel.append("circle").attr("cy", -15).attr("r", 3).attr("fill", "#fff");
  });
}
function drawAnswer() {
  const idx = revealed(), numbered = view() === "final";
  map.root.select("#layer-line").selectAll("path").data(idx).join("path").attr("class", "guess-line")
    .attr("d", (i) => map.path({ type: "LineString", coordinates: [[state.rounds[i].done.glon, state.rounds[i].done.glat], [PUZ[i].lon, PUZ[i].lat]] }));
  marker("answer", idx.map((i) => [PUZ[i].lat, PUZ[i].lon, i + 1]), (sel) => {
    sel.append("circle").attr("r", numbered ? 13 : 18).attr("fill", "var(--answer)").attr("fill-opacity", .25);
    sel.append("path").attr("class", "answer-pin").attr("stroke-width", 1.2)
      .attr("d", d3.symbol(d3.symbolStar, numbered ? 330 : 260)());
    if (numbered) sel.append("text").attr("class", "answer-num").attr("text-anchor", "middle").attr("dy", "0.36em").text((d) => d[2]);
  });
}
function drawAll() { drawPlayers(); drawCrowd(); drawAnswer(); drawMine(); renderLegend(); }

function renderLegend() {
  const v = view();
  $("#legend").innerHTML = v === "guess"
    ? `<span><i style="background:var(--players)"></i>Where people are playing today</span>`
    : `<span><i style="background:var(--pin)"></i>You</span><span><i style="background:var(--answer)"></i>Answer</span>`
      + (v === "final" ? `<span><i style="background:var(--crowd)"></i>Everyone's guesses</span>` : "");
}

function fitToResult(animate = true) {
  const idx = revealed();
  if (!idx.length) return;
  const W = +map.svg.attr("viewBox").split(" ")[2], H = +map.svg.attr("viewBox").split(" ")[3];
  const shape = { type: "MultiLineString", coordinates: idx.map((i) => [[state.rounds[i].done.glon, state.rounds[i].done.glat], [PUZ[i].lon, PUZ[i].lat]]) };
  const [[x0, y0], [x1, y1]] = map.path.bounds(shape);
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

/* ---------- guess ---------- */
function updateLock() {
  const btn = $("#lock-btn");
  $("#lock-bar").hidden = view() !== "guess";
  btn.disabled = !cur().pin;
  btn.textContent = cur().pin ? "📍 Pin it!" : "Drop a pin on the map";
}

$("#lock-btn").addEventListener("click", () => {
  const r = cur(), p = curPuz();
  if (!r.pin || r.done) return;
  const [glat, glon] = r.pin;
  const km = Math.round(distanceKm(glat, glon, p.lat, p.lon) * 10) / 10;
  r.done = { glat, glon, km, clues: r.clues, score: scoreFor(km, r.clues) };
  save();
  track("Guess", { round: state.round + 1, clues: r.clues, distance: kmBucket(km), day: DAY });
  render(true);
});

function nextRound() {
  if (state.round < ROUNDS - 1) {
    state.round++; save();
    render(false);
    resetZoom(true);
    $("#map-hint").style.opacity = 1;
  } else finishGame();
}

async function finishGame() {
  const btn = $("#next-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Adding up your score…"; }
  const ms = Date.now() - state.started;
  let res = null;
  if (!preview) {
    try {
      const r = await fetch("/api/play", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ day: DAY, player, name: myName, ms, rounds: state.rounds.map((x) => ({ lat: x.done.glat, lon: x.done.glon, clues: x.done.clues })) }),
      });
      if (r.ok) res = await r.json();
    } catch {}
  }
  if (res && Array.isArray(res.rounds)) {
    // Trust the server's numbers (and its copy, if this device already played today).
    res.rounds.forEach((x, i) => { state.rounds[i].done = { glat: x[0], glon: x[1], clues: x[2], km: Number(x[3]), score: x[4] }; });
    state.final = { score: res.score, km: Number(res.km), beat: res.beat, players: res.players };
  } else {
    const score = runningTotal();
    state.final = { score, km: doneRounds().reduce((s, r) => s + r.done.km, 0), beat: estimateBeat(score), players: lastStats?.players || 1, local: true };
    if (!preview) toast("Couldn't reach the server. Your result is saved on this device.");
  }
  save();
  track("Finish game", { score: scoreBucket(state.final.score), clues: totalClues(), day: DAY, offline: !!state.final.local });
  recordHistory();
  render(true);
  loadPins();
  refreshStats(true);
}

const totalClues = () => doneRounds().reduce((s, r) => s + r.done.clues, 0);

function estimateBeat(score) {
  // Preview mode only: a rough guess from the average.
  const avg = lastStats?.avgScore || 1800;
  return Math.max(1, Math.min(99, Math.round(50 + (score - avg) / 40)));
}

function recordHistory() {
  const h = store.get("sw:history", {});
  h[DAY] = state.final.score;
  store.set("sw:history", h);
}
function streak() {
  const h = store.get("sw:history", {});
  let s = 0;
  for (let d = DAY; h[d] != null; d--) s++;
  return s;
}

/* ---------- result sheet ---------- */
function roundHTML() {
  const r = cur().done, p = curPuz(), last = state.round === ROUNDS - 1;
  return `
    <div class="result-top">
      <div>
        <div class="eyebrow">Round ${state.round + 1} of ${ROUNDS} · the answer was</div>
        <h2>${esc(p.name)}</h2>
      </div>
      <div class="km"><b>${fmtKm(r.km)}</b><span>from the answer</span></div>
    </div>
    <div class="scorebar"><div class="fill" id="r-bar" data-w="${(r.score / MAX_POINTS * 100).toFixed(1)}"></div></div>
    <div class="score-line">
      <span>${roundSquare(r.km)} <b>${fmt(r.score)}</b> / ${fmt(MAX_POINTS)} points</span>
      <span class="muted">Total <b>${fmt(runningTotal())}</b></span>
    </div>
    <p class="fact">${esc(p.fact)}</p>
    <button class="guess" id="next-btn">${last ? "See your final score" : "Next round →"}</button>`;
}

function finalHTML() {
  const f = state.final;
  const rows = state.rounds.map((x, i) => `
    <li><span class="sq">${roundSquare(x.done.km)}</span>
      <span class="who">${i + 1}. ${esc(PUZ[i].name)}<span class="sub">${fmtKm(x.done.km)} · ${x.done.clues} clue${x.done.clues > 1 ? "s" : ""}</span></span>
      <span class="val">${fmt(x.done.score)}</span></li>`).join("");
  return `
    <div class="result-top">
      <div>
        <div class="eyebrow">Somewhere #${DAY} · your score</div>
        <h2>${fmt(f.score)} <span class="of">/ ${fmt(MAX_TOTAL)}</span></h2>
      </div>
      <div class="km"><b>${f.beat}%</b><span>of players beaten</span></div>
    </div>
    <div class="scorebar"><div class="fill" id="r-bar" data-w="${(f.score / MAX_TOTAL * 100).toFixed(1)}"></div></div>
    <ol class="rounds">${rows}</ol>
    <div class="share-row">
      <button class="guess small" id="share-btn" data-umami-event="Share result">Share result</button>
      <button class="ghost" id="card-btn" data-umami-event="Save image">Save image</button>
      <button class="ghost" id="result-boards" data-umami-event="Open leaderboard">🏆 Leaderboard</button>
    </div>
    <div class="me-row">
      <label for="name-input">Your name on the board</label>
      <div class="name-edit">
        <input id="name-input" maxlength="20" autocomplete="off" value="${esc(myName)}">
        <button class="ghost" id="name-save" data-umami-event="Rename">Save</button>
      </div>
    </div>
    <div class="next">5 new places in <b id="countdown">--:--:--</b> · streak <b>${streak()}</b></div>`;
}

function bindSheet() {
  $("#next-btn")?.addEventListener("click", nextRound);
  $("#share-btn")?.addEventListener("click", share);
  $("#card-btn")?.addEventListener("click", saveCard);
  $("#result-boards")?.addEventListener("click", openBoards);
  $("#name-save")?.addEventListener("click", rename);
}

function render(animate) {
  const v = view(), sheet = $("#result");
  renderClues();
  updateLock();
  $("#map-hint").hidden = v !== "guess";
  if (v === "guess") { sheet.hidden = true; sheet.innerHTML = ""; }
  else {
    sheet.innerHTML = v === "final" ? finalHTML() : roundHTML();
    sheet.hidden = false;
    sheet.scrollTop = 0;
    if (animate) { sheet.style.animation = "none"; void sheet.offsetWidth; sheet.style.animation = ""; }
    bindSheet();
    tick();
  }
  if (map.svg) drawAll();
  if (v !== "guess" && matchMedia("(max-width: 640px)").matches) setClues(false);
  if (v === "guess") setClues(true);
  if (v !== "guess") requestAnimationFrame(() => {
    if (map.svg) fitToResult(animate);
    const bar = $("#r-bar");
    if (bar) requestAnimationFrame(() => { bar.style.width = bar.dataset.w + "%"; });
  });
}

/* ---------- sharing ---------- */
function shareText() {
  const f = state.final;
  return [
    `Somewhere #${DAY} 🌍 ${fmt(f.score)} / ${fmt(MAX_TOTAL)}`,
    state.rounds.map((x) => roundSquare(x.done.km)).join(""),
    `🔎 ${totalClues()} clues · beat ${f.beat}%`,
    location.origin.startsWith("http") ? location.origin : "",
  ].filter(Boolean).join("\n");
}

async function share() {
  const text = shareText();
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); toast("Copied! Paste it anywhere."); }
  catch { prompt("Copy your result:", text); }
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

// A 1080x1350 image card with a mini map of all 5 guesses. Great for stories.
async function makeCard() {
  const f = state.final, W = 1080, H = 1350;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  await document.fonts.ready;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#e3f0f8");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#f5b301"; ctx.beginPath(); ctx.arc(102, 116, 22, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(102, 116, 13, 0, 7); ctx.fill(); ctx.fillStyle = "#e5484d"; ctx.beginPath(); ctx.arc(102, 116, 7, 0, 7); ctx.fill();
  ctx.fillStyle = "#17202e"; ctx.font = "800 64px 'Bricolage Grotesque', Inter, sans-serif"; ctx.fillText("Somewhere", 140, 136);
  ctx.fillStyle = "#5d6878"; ctx.font = "700 40px Inter, sans-serif"; ctx.textAlign = "right"; ctx.fillText(`#${DAY}`, W - 80, 130); ctx.textAlign = "left";

  // mini map with all 5 lines
  const mx = 60, my = 190, mw = W - 120, mh = 560;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 32); ctx.clip();
  ctx.fillStyle = "#cfe6f3"; ctx.fillRect(mx, my, mw, mh);
  const lines = state.rounds.map((x, i) => [[x.done.glon, x.done.glat], [PUZ[i].lon, PUZ[i].lat]]);
  const proj = d3.geoNaturalEarth1().fitExtent([[mx + 20, my + 20], [mx + mw - 20, my + mh - 20]], { type: "Sphere" });
  const path = d3.geoPath(proj, ctx);
  ctx.beginPath(); path(map.land); ctx.fillStyle = "#f1efe4"; ctx.fill();
  ctx.strokeStyle = "#c9c3ad"; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.beginPath(); path({ type: "MultiLineString", coordinates: lines }); ctx.setLineDash([10, 8]); ctx.strokeStyle = "#17202e"; ctx.lineWidth = 3.5; ctx.stroke(); ctx.setLineDash([]);
  state.rounds.forEach((x, i) => {
    const [ax, ay] = proj([PUZ[i].lon, PUZ[i].lat]), [gx, gy] = proj([x.done.glon, x.done.glat]);
    ctx.fillStyle = "#e5484d"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(gx, gy, 11, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f5b301"; ctx.strokeStyle = "#5b4300"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ax, ay, 17, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#3d2d00"; ctx.font = "800 20px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText(String(i + 1), ax, ay + 7); ctx.textAlign = "left";
  });
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#17202e"; ctx.font = "800 150px 'Bricolage Grotesque', Inter, sans-serif"; ctx.fillText(fmt(f.score), W / 2, 920);
  ctx.fillStyle = "#5d6878"; ctx.font = "600 42px Inter, sans-serif";
  ctx.fillText(`out of ${fmt(MAX_TOTAL)}  ·  beat ${f.beat}%`, W / 2, 990);
  // one tile per round
  const colors = { "🟩": "#19a463", "🟨": "#f5b301", "🟧": "#f08a24", "🟥": "#e5484d", "⬛": "#c3cad4" };
  state.rounds.forEach((x, i) => {
    ctx.fillStyle = colors[roundSquare(x.done.km)]; ctx.beginPath(); ctx.roundRect(W / 2 - 340 + i * 140, 1040, 120, 64, 16); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "800 28px Inter, sans-serif"; ctx.fillText(fmt(x.done.score), W / 2 - 280 + i * 140, 1082);
  });
  ctx.fillStyle = "#17202e"; ctx.font = "700 46px Inter, sans-serif";
  ctx.fillText("Can you find today's 5 places?", W / 2, 1220);
  ctx.fillStyle = "#c8402b"; ctx.font = "800 36px Inter, sans-serif";
  ctx.fillText(location.host || "somewhere", W / 2, 1280);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

async function rename() {
  const v = $("#name-input").value.trim().slice(0, 20);
  if (!v) return;
  myName = v; store.set("sw:name", v);
  if (!preview && state.final && !state.final.local) {
    try { await fetch("/api/name", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day: DAY, player, name: v }) }); } catch {}
  }
  toast("Name saved");
  refreshStats(true);
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
  if (!s) { preview = true; s = sampleStats(); }
  $("#preview-banner").hidden = !preview;
  lastStats = s;
  $("#live-count").textContent = fmt(s.players);
  if (map.svg) drawPlayers();
  renderBoards();
}

async function loadPins() {
  if (!state.final) return;
  if (preview || state.final.local) { crowdPins = samplePins(); drawCrowd(); return; }
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
function openBoards() { $("#boards").hidden = false; renderBoards(); track("Open leaderboard"); }
$("#boards-btn").addEventListener("click", openBoards);
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
    meta.textContent = s.players ? `${fmt(s.players)} players today · average ${fmt(s.avgScore)} / ${fmt(MAX_TOTAL)}` : "";
    const mine = state.final;
    $("#board-players").innerHTML = s.top.length ? s.top.map((p, i) => `
      <li class="${mine && p.name === myName && p.score === mine.score ? "me" : ""}">
        <span class="rank">${i + 1}</span>
        <span class="who">${flag(p.country)} ${esc(p.name)}</span>
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

/* ---------- preview data (only used before the database is connected) ---------- */
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
    c.n += n; c.sum += n * (1000 + rnd() * 1800);
  });
  const top = Array.from({ length: 15 }, (_, i) => {
    const km = Math.round((60 + i * i * 40 + rnd() * 80) * 10) / 10;
    return { name: names[i % names.length] + " " + "ABCDEFGHJKLMNPRS"[Math.floor(rnd() * 16)] + ".", country: CC[Math.floor(rnd() * CC.length)], km, score: Math.round(4760 - i * 130 - rnd() * 60) };
  }).sort((a, b) => b.score - a.score);
  const recent = Array.from({ length: 8 }, () => ({ name: names[Math.floor(rnd() * names.length)], country: CC[Math.floor(rnd() * CC.length)], score: Math.floor(800 + rnd() * 3200) }));
  return {
    day: DAY, live: true, players, avgKm: 1900, avgScore: 1800, top, recent, where,
    countries: Object.values(countries).map((c) => ({ c: c.c, n: c.n, avg: Math.round(c.sum / c.n) })),
  };
}
function samplePins() {
  const rnd = seeded(DAY * 104729);
  return PUZ.map((p) => {
    const pins = [];
    for (let i = 0; i < 120; i++) {
      const spread = rnd() < 0.55 ? 6 : rnd() < 0.7 ? 25 : 80;
      const lat = Math.max(-85, Math.min(85, p.lat + (rnd() - .5) * spread));
      const lon = ((p.lon + (rnd() - .5) * spread * 1.6 + 540) % 360) - 180;
      pins.push([lat, lon, 0]);
    }
    return pins;
  });
}

/* ---------- countdown & help ---------- */
function tick() {
  const ms = Math.max(0, nextPuzzleAt() - Date.now());
  const el = $("#countdown");
  if (el) {
    const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
    el.textContent = [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  }
  if (ms === 0 && !tick.reloaded) { tick.reloaded = true; setTimeout(() => location.reload(), 1500); }
}
setInterval(tick, 1000);

const help = $("#help");
$("#help-btn").addEventListener("click", () => help.showModal());
$("#help-close").addEventListener("click", () => help.close());
if (!store.get("sw:seenHelp2", false)) { store.set("sw:seenHelp2", true); try { help.showModal(); } catch {} }

/* ---------- start ---------- */
renderClues();
updateLock();
await initMap();
await refreshStats();
render(false);
if (view() === "guess" && cur().pin) $("#map-hint").style.opacity = 0;
if (state.final) loadPins();
setInterval(() => { if (!document.hidden) refreshStats(); }, 20000);
setInterval(() => { if (!document.hidden && state.final) loadPins(); }, 60000);
