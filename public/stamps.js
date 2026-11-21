// Scout's Passport: ink stamps players collect by playing. All of it lives in the browser.
// Four sets, each with its own stamp shape and ink: habit, skill, collecting and surprise.
import { dateFor, speedFactor } from "./game.js";

export const SETS = [
  { id: "location", name: "On Location", blurb: "Show up, day after day.", shape: "round", ink: "#2f4a35", accent: "#d99a2b" },
  { id: "visas", name: "Visas", blurb: "Find a filming spot on every continent.", shape: "visa", ink: "#5a4330", accent: "#ee7a3b" },
  { id: "sharp", name: "Sharpshooter", blurb: "Big scores and sharp pins.", shape: "oval", ink: "#c95a24", accent: "#2f4a35" },
  { id: "journal", name: "Field Journal", blurb: "Your log of shows, points and stories.", shape: "rect", ink: "#7a5233", accent: "#ee7a3b" },
  { id: "sealed", name: "Sealed Envelopes", blurb: "Secret stamps. Open them to find out.", shape: "hex", ink: "#2f7a6b", accent: "#d99a2b" },
];

// Streak as of a given day, with one free "saver" a week (weeks run from day 1).
export function streakAt(h, day) {
  const week = (d) => Math.floor((d - 1) / 7);
  const usedWeeks = new Set(), saved = [];
  let d = h[day] != null ? day : day - 1, count = 0;
  while (d >= 1) {
    if (h[d] != null) { count++; d--; continue; }
    if (h[d - 1] != null && !usedWeeks.has(week(d))) { usedWeeks.add(week(d)); saved.push(d); d--; continue; }
    break;
  }
  return { count, saved, saverReady: !usedWeeks.has(week(day)) };
}

const rounds = (c) => c.rounds || [];
// Rough continent from coordinates (good enough for well-known filming spots).
export function continentOf(lat, lon) {
  if (lat < -10 && lon > 110) return "oceania";
  if (lon < -30) return lat < 12 ? "south-america" : "north-america";
  if (lon >= -20 && lon <= 52 && lat <= 37 && !(lon > 34.5 && lat > 12)) return "africa";
  if (lat > 35 && lon < 60) return "europe";
  return "asia";
}
const visa = (cont) => ({ test: (c) => rounds(c).some((r) => r.score >= 500 && continentOf(r.lat, r.lon) === cont) });
const scoreTier = (n) => ({ test: (c) => c.score >= n });
const totalTier = (n) => ({ test: (c) => c.total >= n, progress: (c) => [c.total, n], unit: "point" });
const streakStamp = (n) => ({ test: (c) => c.streak.count >= n, progress: (c) => [c.streak.count, n], unit: "day" });
const playedStamp = (n) => ({ test: (c) => c.played >= n, progress: (c) => [c.played, n], unit: "game" });

// c = { day, score, played, total, streak, prev, hour, rounds: [{ km, score, secs, level, lat, lon, kind }] | null }
export const STAMPS = [
  { id: "first-take", set: "location", name: "First Take", rim: "TAKE 1", icon: "clapper", rule: "Finish your first game.",
    note: "Take one is in the can. Welcome to the crew.", test: () => true },
  { id: "callback", set: "location", name: "Callback", rim: "DAY 3", icon: "three", rule: "Play 3 days in a row.",
    note: "Three days running. The crew's starting to know your name.", ...streakStamp(3) },
  { id: "week", set: "location", name: "Week on Location", rim: "DAY 7", icon: "chair", rule: "Play 7 days in a row.",
    note: "Seven days on location. You're a regular now.", ...streakStamp(7) },
  { id: "fortnight", set: "location", name: "Fortnight Crew", rim: "DAY 14", icon: "reels", rule: "Play 14 days in a row.",
    note: "Two weeks on set. That's real commitment.", ...streakStamp(14) },
  { id: "season", set: "location", name: "Season Wrap", rim: "DAY 30", icon: "tent", rule: "Play 30 days in a row.",
    note: "Thirty days. That's a whole season. Wrap party's on me.", ...streakStamp(30) },
  { id: "back-on-set", set: "location", name: "Back on Set", rim: "WELCOME BACK", icon: "comeback", rule: "Come back after 3 or more days away.",
    note: "Look who's back on set! We saved your chair.", test: (c) => c.prev != null && c.day - c.prev >= 4 },
  { id: "stunt-double", set: "location", name: "Stunt Double", rim: "SAVER", icon: "mask", rule: "Let your weekly saver rescue your streak.",
    note: "Your stunt double covered for you. Nobody noticed.", test: (c) => c.streak.saved.includes(c.day - 1) },

  { id: "visa-europe", set: "visas", name: "Europe", scene: "europe", rule: "Score 500 or more on a place in Europe.",
    note: "Castles, cobblestones and a lot of costume dramas.", ...visa("europe") },
  { id: "visa-north-america", set: "visas", name: "North America", scene: "north-america", rule: "Score 500 or more on a place in North America.",
    note: "Desert roads and big skylines. Classic backlot country.", ...visa("north-america") },
  { id: "visa-south-america", set: "visas", name: "South America", scene: "south-america", rule: "Score 500 or more on a place in South America.",
    note: "Peaks, rainforests and one very long coastline.", ...visa("south-america") },
  { id: "visa-africa", set: "visas", name: "Africa", scene: "africa", rule: "Score 500 or more on a place in Africa.",
    note: "Sunsets that need no color grading.", ...visa("africa") },
  { id: "visa-asia", set: "visas", name: "Asia", scene: "asia", rule: "Score 500 or more on a place in Asia.",
    note: "Mountains, temples and neon. Every frame a postcard.", ...visa("asia") },
  { id: "visa-oceania", set: "visas", name: "Oceania", scene: "oceania", rule: "Score 500 or more on a place in Oceania.",
    note: "All the way down under. Long flight, great light.", ...visa("oceania") },
  { id: "matinee", set: "sharp", name: "Matinee", icon: "tier1", rule: "Score 2,500 or more in one day.",
    note: "Half the house is cheering. Nice show.", ...scoreTier(2500) },
  { id: "prime-time", set: "sharp", name: "Prime Time", icon: "tier2", rule: "Score 3,500 or more in one day.",
    note: "Prime-time numbers. The audience is hooked.", ...scoreTier(3500) },
  { id: "on-the-map", set: "sharp", name: "On the Map", icon: "mapdot", rule: "Drop a pin within 100 km of a place.",
    note: "Close enough to hear the cameras roll.", test: (c) => rounds(c).some((r) => r.km <= 100) },
  { id: "bullseye", set: "sharp", name: "Bullseye", icon: "crosshair", rule: "Drop a pin within 25 km of a place.",
    note: "Right on the mark. Print that one!", test: (c) => rounds(c).some((r) => r.km <= 25) },
  { id: "eagle-eye", set: "sharp", name: "Eagle Eye", icon: "feather", rule: "Drop a pin within 1 km of a place.",
    note: "Under a kilometer. Were you there for the shoot?", test: (c) => rounds(c).some((r) => r.km <= 1) },
  { id: "golden-hour", set: "sharp", name: "Golden Hour", icon: "sun", rule: "Score 4,000 or more in one day.",
    note: "Four thousand points. That's golden-hour light.", ...scoreTier(4000) },
  { id: "directors-cut", set: "sharp", name: "Director's Cut", icon: "megaphone", rule: "Score 4,750 or more in one day.",
    note: "That's the director's cut. Not a frame wasted.", ...scoreTier(4750) },
  { id: "quick-draw", set: "sharp", name: "Quick Draw", icon: "stopwatch", rule: "Get the full speed bonus on all 5 places.",
    note: "Five fast takes. No retakes needed.", test: (c) => rounds(c).length >= 5 && rounds(c).every((r) => speedFactor(r.secs) >= 1) },
  { id: "plot-twist", set: "sharp", name: "Plot Twist", icon: "twist", rule: "Score 1,000 or more on both hard riddles in a day.",
    note: "Both hard riddles cracked. Didn't see that twist coming.", test: (c) => { const h = rounds(c).filter((r) => r.level === "hard"); return h.length >= 2 && h.every((r) => r.score >= 1000); } },
  { id: "clean-sweep", set: "sharp", name: "Clean Sweep", icon: "pins", rule: "Land every pin of a day within 500 km.",
    note: "Every pin within 500 km. Not a single blooper.", test: (c) => rounds(c).length >= 5 && rounds(c).every((r) => r.km <= 500) },

  { id: "box-office-1", set: "journal", name: "Box Office I", rim: "10 SHOWS", icon: "ticket1", rule: "Play 10 days.",
    note: "Ten shows on the board. The regulars are noticing.", ...playedStamp(10) },
  { id: "box-office-2", set: "journal", name: "Box Office II", rim: "25 SHOWS", icon: "ticket2", rule: "Play 25 days.",
    note: "Twenty-five shows. The box office loves you.", ...playedStamp(25) },
  { id: "opening-weekend", set: "journal", name: "Opening Weekend", rim: "10,000 PTS", icon: "gross1", rule: "Earn 10,000 points in total.",
    note: "Ten thousand points banked. What an opening weekend.", ...totalTier(10000) },
  { id: "blockbuster", set: "journal", name: "Blockbuster", rim: "50,000 PTS", icon: "gross2", rule: "Earn 50,000 points in total.",
    note: "Fifty thousand points. Lines around the block.", ...totalTier(50000) },
  { id: "record-breaker", set: "journal", name: "Record Breaker", rim: "100,000 PTS", icon: "gross3", rule: "Earn 100,000 points in total.",
    note: "A hundred thousand points. They'll write about this one.", ...totalTier(100000) },
  { id: "bookworm", set: "journal", name: "Bookworm", icon: "book", rule: "Score 500 or more on a place from a book.",
    note: "Straight off the page and onto the map.", test: (c) => rounds(c).some((r) => r.kind === "book" && r.score >= 500) },
  { id: "front-row", set: "journal", name: "Front Row", icon: "popcorn", rule: "Score 500 or more on a place from a movie.",
    note: "Best seat in the house. You knew that scene.", test: (c) => rounds(c).some((r) => r.kind === "film" && r.score >= 500) },

  { id: "opening-week", set: "sealed", name: "Opening Week", icon: "premiere", rule: "Play during the first week, No. 1 to 7.", hint: "Only for the first crowd. Gone after Nov 28.",
    note: "You were here opening week. Only the first crowd gets this one.", test: (c) => c.day <= 7 },
  { id: "night-shoot", set: "sealed", name: "Night Shoot", icon: "moon", rule: "Finish a game between midnight and 4 AM.", hint: "Some scenes are shot after dark.",
    note: "Shooting after dark? Bold choice.", test: (c) => c.hour != null && c.hour < 4 },
  { id: "long-way", set: "sealed", name: "The Long Way Round", label: "Long Way", icon: "loop", rule: "Drop a pin more than 15,000 km from the place.", hint: "Even scouts get lost.",
    note: "Even scouts get lost. Call it the scenic route.", test: (c) => rounds(c).some((r) => r.km > 15000) },
  { id: "holiday", set: "sealed", name: "Holiday Special", icon: "snowflake", rule: "Play on December 25.", hint: "Check back in the snowy season.",
    note: "A holiday special! Thanks for spending it on set.", test: (c) => { const d = dateFor(c.day); return d.getUTCMonth() === 11 && d.getUTCDate() === 25; } },
];
export const stampById = (id) => STAMPS.find((s) => s.id === id);
export const setOf = (s) => SETS.find((x) => x.id === s.set);

// Which new stamps a context earns.
export const earnedNow = (c, got) => STAMPS.filter((s) => !got[s.id] && s.test(c));

// Contexts for every past day in the history (day -> total score), oldest first, for backdating.
export function historyContexts(h) {
  const days = Object.keys(h).map(Number).filter((d) => d >= 1).sort((a, b) => a - b);
  let total = 0;
  return days.map((d, i) => ({ day: d, score: h[d], played: i + 1, total: (total += Number(h[d]) || 0), streak: streakAt(h, d), prev: i ? days[i - 1] : null, hour: null, rounds: null }));
}

// The stamp you're closest to (for "2 more days to Week on Location").
export function nearest(c, got) {
  let best = null;
  for (const s of STAMPS) {
    if (got[s.id] || !s.progress) continue;
    const [have, need] = s.progress(c), left = need - have;
    if (left > 0 && (!best || left < best.left)) best = { stamp: s, left, have, need };
  }
  return best;
}

/* ---------- art: one template, four shapes ---------- */
const star = (cx, cy, r, k = 0.45) => {
  let d = "";
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * k : r; d += `${i ? "L" : "M"}${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`; }
  return d + "Z";
};
const pin = (x, y) => `M${x} ${y - 9}a5 5 0 0 1 5 5c0 4-5 9-5 9s-5-5-5-9a5 5 0 0 1 5-5z`;
const S = 'fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';
// Second ink: "ACC" is swapped for the set's accent color when the stamp is drawn.
const A = 'fill="ACC"';
const SA = 'fill="none" stroke="ACC" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"';
const TA = (x, y, sz, t) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="${sz}" fill="ACC">${t}</text>`;
const T = (x, y, s, t) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="${s}" fill="currentColor">${t}</text>`;
const ICONS = {
  clapper: `<path ${S} d="M31 44h38v22H31z"/><path fill="ACC" stroke="currentColor" stroke-width="3" stroke-linejoin="round" d="M30 40l36-10 2 7-36 10z"/><path ${S} stroke-width="3" d="M41 36.5l4 6M52 33.5l4 6"/>`,
  three: `<rect ${S} x="33" y="27" width="34" height="40" rx="3"/><path ${A} d="M37 31h3v4h-3zM37 59h3v4h-3zM60 31h3v4h-3zM60 59h3v4h-3z"/>${T(50, 58, 26, "3")}`,
  chair: `<path ${S} d="M35 28v22M65 28v22M35 31h30v12H35M31 50h38M37 50l26 17M63 50L37 67"/><rect x="36" y="32" width="28" height="10" fill="ACC"/>${T(50, 41, 10, "7")}`,
  reels: `<circle ${S} cx="38" cy="47" r="11"/><circle ${S} cx="62" cy="47" r="11"/><g ${A}><circle cx="38" cy="41.5" r="2.6"/><circle cx="62" cy="41.5" r="2.6"/><circle cx="38" cy="52.5" r="2.6"/><circle cx="62" cy="52.5" r="2.6"/><circle cx="32.5" cy="47" r="2.6"/><circle cx="67.5" cy="47" r="2.6"/><circle cx="43.5" cy="47" r="2.6"/><circle cx="56.5" cy="47" r="2.6"/></g>`,
  tent: `<path ${S} d="M30 66l20-30 20 30zM50 36v30M44 66l6-11 6 11"/><path ${S} stroke-width="2.5" d="M27 32q23-9 46 0"/><path ${A} d="M33 30l3 7 3-8zM45 27l3 7 3-7zM57 27l3 7 3-6z"/>`,
  comeback: `<path ${S} d="M37 56a15 15 0 1 0 1-17"/><path ${S} d="M36 30v10h10"/><path ${A} d="${star(52, 48, 8)}"/>`,
  mask: `<path ${F} d="M28 42q22-10 44 0 2 15-11 15-7 0-11-7-4 7-11 7-13 0-11-15z"/><ellipse cx="40" cy="47" rx="5" ry="3.5" fill="#fbf6ea"/><ellipse cx="60" cy="47" rx="5" ry="3.5" fill="#fbf6ea"/><path ${S} stroke-width="3" d="M28 42l-6-3M72 42l6-3"/>`,
  crosshair: `<circle ${S} cx="50" cy="47" r="16"/><path ${S} stroke-width="3" d="M50 25v10M50 59v10M28 47h10M62 47h10"/><circle ${A} cx="50" cy="47" r="6"/>`,
  feather: `<path ${S} d="M64 28c6 14-2 28-22 32 0-14 8-26 22-32zM36 66l20-26"/><path ${SA} d="M47 52l-6-2M52 45l-5-3M57 38l-4-3"/>`,
  sun: `<path ${A} d="M37 54a13 13 0 0 1 26 0z"/><path ${S} d="M37 54a13 13 0 0 1 26 0"/><path ${S} stroke-width="3" d="M50 31v5M34 37l3.5 3.5M66 37l-3.5 3.5M28 50h4M68 50h4"/><path ${S} d="M27 62q12-9 23-2 12-8 23 2"/>`,
  megaphone: `<path ${S} d="M30 43v10h7l17 10V33L37 43z"/><path ${A} d="${star(64, 34, 7)}"/><path ${A} d="${star(71, 50, 5.5)}"/><path ${A} d="${star(63, 63, 4.5)}"/>`,
  stopwatch: `<circle ${S} cx="54" cy="50" r="15"/><path ${S} d="M54 50v-8M54 50l6 4M50 30h8M54 30v5"/><path ${SA} d="M26 44h9M24 52h8M27 60h8"/>`,
  twist: `<path ${S} d="M40 37a9 9 0 1 1 13 8c-3 2-3 4-3 7"/><circle ${F} cx="50" cy="60" r="3"/><path ${SA} stroke-width="4" d="M58 58q10-2 10-12M64 50l4-5 4 5"/>`,
  pins: `<path ${A} stroke="currentColor" stroke-width="1.5" d="${pin(30, 50)}${pin(40, 50)}${pin(50, 50)}${pin(60, 50)}${pin(70, 50)}"/><path ${S} stroke-width="3" d="M26 62h48"/>`,
  ticket1: `<path ${S} d="M28 34h44v8a5 5 0 0 0 0 10v8H28v-8a5 5 0 0 0 0-10z"/><path ${S} stroke-width="2" stroke-dasharray="2 3" d="M40 35v24"/>${TA(57, 54.5, 19, "I")}`,
  ticket2: `<path ${S} d="M28 34h44v8a5 5 0 0 0 0 10v8H28v-8a5 5 0 0 0 0-10z"/><path ${S} stroke-width="2" stroke-dasharray="2 3" d="M40 35v24"/>${TA(57, 54.5, 19, "II")}`,
  premiere: `<path ${A} stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" d="${star(50, 45, 16)}"/><path ${S} stroke-width="3" d="M50 22v-3M31 30l-2-2M69 30l2-2M27 48h-3M73 48h3"/>`,
  moon: `<path ${F} d="M58 28a19 19 0 1 0 10 30 15 15 0 0 1-10-30z"/><path ${A} d="${star(66, 35, 5)}"/><path ${A} d="${star(73, 48, 4)}"/>`,
  loop: `<path ${S} stroke-width="3" stroke-dasharray="1 6" d="M28 62c0-14 30-8 28-22-1-10-16-8-14 1 2 10 22 12 22-6"/><path ${A} stroke="currentColor" stroke-width="1.5" d="${pin(66, 33)}"/>`,
  snowflake: `<path ${S} d="M50 28v38M34 37l32 20M66 37L34 57"/><path ${SA} d="M45 30l5 5 5-5M45 64l5-5 5 5M33 43l6-1-1-6M67 51l-6 1 1 6M67 43l-6-1 1-6M33 51l6 1-1 6"/>`,
  tier1: `<path ${S} d="M30 40h40v20H30z"/><path ${A} d="${star(50, 50, 8)}"/><path ${S} stroke-width="3" d="M34 34h32M34 66h32"/>`,
  tier2: `<path ${S} d="M28 38h44v24H28z"/><path ${A} d="${star(41, 50, 7)}"/><path ${A} d="${star(59, 50, 7)}"/><path ${S} stroke-width="3" d="M32 32h36M32 68h36"/>`,
  mapdot: `<path ${S} d="M28 36l14-6 16 6 14-6v30l-14 6-16-6-14 6z"/><path ${S} stroke-width="2.5" d="M42 30v30M58 36v30"/><circle ${A} cx="50" cy="47" r="6"/>`,
  gross1: `<path ${S} d="M32 64V44l18-12 18 12v20z"/>${TA(50, 59, 15, "10K")}`,
  gross2: `<path ${S} d="M30 64V40h40v24zM26 40h48M34 40l4-8h24l4 8"/>${TA(50, 58, 14, "50K")}`,
  gross3: `<path ${A} stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" d="M38 30h24v10a12 12 0 0 1-24 0z"/><path ${S} d="M38 33h-6a6 6 0 0 0 6 9M62 33h6a6 6 0 0 1-6 9M50 52v8M40 64h20"/>`,
  book: `<path ${S} d="M50 36c-6-4-14-5-20-4v28c6-1 14 0 20 4 6-4 14-5 20-4V32c-6-1-14 0-20 4zM50 36v28"/><path ${SA} d="M56 31v14l3-2 3 2V32"/>`,
  popcorn: `<path ${S} d="M36 44l4 22h20l4-22z"/><path ${SA} d="M43 45l1 20M50 45v20M57 45l-1 20"/><path ${A} stroke="currentColor" stroke-width="2.5" d="M34 44a5 5 0 0 1 4-8 6 6 0 0 1 10-4 6 6 0 0 1 10 2 5 5 0 0 1 6 10z"/>`,
  envelope: `<rect ${S} x="29" y="34" width="42" height="28" rx="2"/><path ${S} d="M29 36l21 14 21-14"/><circle ${A} cx="50" cy="51" r="6"/>`,
};

let uid = 0;
const tint = (on) => on ? ' fill="currentColor" fill-opacity=".08"' : ' fill="none"';
const SHAPES = {
  round: (on) => `<circle cx="50" cy="50" r="46"${tint(on)} stroke="currentColor" stroke-width="4.5"${on ? "" : ' stroke-dasharray="5 4"'}/><circle cx="50" cy="50" r="40.5" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="50" cy="50" r="31" fill="none" stroke="currentColor" stroke-width="2"/>${on ? `<path fill="ACC" d="${star(14.5, 50, 3.2)}${star(85.5, 50, 3.2)}"/>` : ""}`,
  oval: (on) => `<ellipse cx="50" cy="50" rx="47" ry="38"${tint(on)} stroke="currentColor" stroke-width="4.5"${on ? "" : ' stroke-dasharray="5 4"'}/><ellipse cx="50" cy="50" rx="41" ry="32" fill="none" stroke="currentColor" stroke-width="1.6"/>${on ? `<path fill="ACC" d="${star(50, 16, 3)}${star(41, 17.5, 2.2)}${star(59, 17.5, 2.2)}"/>` : ""}`,
  rect: (on) => `<rect x="5" y="13" width="90" height="74" rx="7"${tint(on)} stroke="currentColor" stroke-width="4.5"${on ? "" : ' stroke-dasharray="5 4"'}/><rect x="11" y="19" width="78" height="62" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2.5"/>`,
  hex: (on) => `<path d="M50 4l40 23v46L50 96 10 73V27z"${tint(on)} stroke="currentColor" stroke-width="4.5"${on ? "" : ' stroke-dasharray="5 4"'}/><path d="M50 12l33 19v38L50 88 17 69V31z" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
};

// Visa scenes: little landscapes in full color, framed like a postage stamp (our own drawings).
const SCENES = {
  "europe": `<rect x="18" y="14" width="64" height="56" fill="#a9cbc0"/><path d="M18 58q16-10 32-2t32-4v18H18z" fill="#6f8455"/><path d="M38 60V40h6v-6h4v6h4v-6h4v6h6v20z" fill="#7a5233"/><path d="M45 60v-8a5 5 0 0 1 10 0v8z" fill="#3f3224"/><path d="M48 34V24l8 3-8 3" fill="#ee7a3b"/><circle cx="70" cy="24" r="5" fill="#f6d48a"/>`,
  "north-america": `<rect x="18" y="14" width="64" height="56" fill="#f6c58e"/><circle cx="62" cy="30" r="9" fill="#fbe3b0"/><path d="M18 52h10v-10h14v10h6v-16h16v16h18v18H18z" fill="#c95a24"/><path d="M18 62h64v8H18z" fill="#a8471b"/><path d="M30 64V50m0 6h-4v-4m4 6h4v-6" stroke="#2f4a35" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  "south-america": `<rect x="18" y="14" width="64" height="56" fill="#cfe3d8"/><circle cx="68" cy="26" r="6" fill="#f6d48a"/><path d="M18 64l20-30 12 14 10-18 22 34z" fill="#4f7d5c"/><path d="M50 30l-4 6h8z" fill="#fffdf8"/><path d="M26 60h16M30 55h12M34 50h9" stroke="#2f4a35" stroke-width="2" stroke-linecap="round"/><path d="M18 64h64v6H18z" fill="#6f8455"/>`,
  "africa": `<rect x="18" y="14" width="64" height="56" fill="#f2cf7e"/><circle cx="50" cy="44" r="16" fill="#ee7a3b"/><path d="M18 58h64v12H18z" fill="#c9a25a"/><path d="M57 58V44" stroke="#5a4330" stroke-width="5"/><path d="M46 40q11-8 22 0M48 44q9-6 18 0" stroke="#5a4330" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M43 39a14 6 0 0 1 28 0z" fill="#5a4330"/>`,
  "asia": `<rect x="18" y="14" width="64" height="56" fill="#f6d9c4"/><path d="M18 62l22-30 22 30z" fill="#7d8fa0"/><path d="M34 40l6-8 6 8-3-1-3 2-3-2z" fill="#fffdf8"/><circle cx="68" cy="26" r="6" fill="#ee7a3b"/><path d="M58 62V52M54 52h16l-3-4H57zM56 48h12l-3-4h-6zM60 44v-4" stroke="#2f4a35" stroke-width="2.5" fill="#2f4a35" stroke-linejoin="round"/><path d="M18 62h64v8H18z" fill="#6f8455"/>`,
  "oceania": `<rect x="18" y="14" width="64" height="56" fill="#a9cbc0"/><circle cx="34" cy="28" r="7" fill="#f6d48a"/><path d="M18 56q8-4 16 0t16 0 16 0 16 0v14H18z" fill="#4f9a92"/><path d="M18 62q8-4 16 0t16 0 16 0 16 0v8H18z" fill="#2f7a6b"/><path d="M62 58q-2-14 2-22" stroke="#7a5233" stroke-width="3" fill="none"/><path d="M64 36q-10-2-14 4M64 36q8-6 14-2M64 36q2-8 10-8M64 36q-6-8-12-6" stroke="#4f7d5c" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
};
function visaSVG(s, on, id, date) {
  // Perforated edge: a mask punches half circles out of the stamp's border.
  const holes = [];
  for (let x = 10; x <= 90; x += 8) holes.push(`<circle cx="${x}" cy="5" r="3"/><circle cx="${x}" cy="95" r="3"/>`);
  for (let y = 13; y <= 87; y += 8) holes.push(`<circle cx="9" cy="${y}" r="3"/><circle cx="91" cy="${y}" r="3"/>`);
  const scene = on ? SCENES[s.scene] : `<rect x="18" y="14" width="64" height="56" fill="none" stroke="#c9b993" stroke-width="2" stroke-dasharray="4 3"/><text x="50" y="50" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="22" fill="#c9b993">?</text>`;
  return `<defs><mask id="${id}m"><rect width="100" height="100" fill="#fff"/><g fill="#000">${holes.join("")}</g></mask></defs>
    <g mask="url(#${id}m)"><rect x="9" y="5" width="82" height="90" fill="${on ? "#fffdf8" : "#f3ead3"}" stroke="${on ? "#e3d7bd" : "#d9cba9"}" stroke-width="1"/></g>
    ${scene}
    <text x="50" y="80" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="8.5" letter-spacing=".6" fill="${on ? "#3f3224" : "#bfae8a"}"${s.name.length > 10 ? ' textLength="60" lengthAdjust="spacingAndGlyphs"' : ""}>${s.name.toUpperCase()}</text>
    <text x="50" y="88" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="800" font-size="5" letter-spacing="1.2" fill="${on ? "#b4561f" : "#cbbd9b"}">VISA · SOMEWHERE</text>
    ${on ? `<g filter="url(#ink)" opacity=".75" fill="none" stroke="#5a4330" stroke-width="1.6"><circle cx="70" cy="58" r="13"/><circle cx="70" cy="58" r="9.5" stroke-width=".8"/><text x="70" y="60" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="5.5" fill="#5a4330" stroke="none">${date || "SCOUTED"}</text><path d="M38 52q8-4 16 0t16 0M38 57q8-4 16 0t16 0M38 62q8-4 16 0" stroke-width="1.2"/></g>` : ""}`;
}

// on: earned (full ink). Off: a faint dotted outline. A sealed stamp that's not earned shows an envelope.
// date: a short date to print on the stamp, like "NOV 23".
export function stampSVG(s, on = true, size = 96, date = "") {
  const set = setOf(s), id = `st${++uid}`, sealed = !on && set.id === "sealed";
  const label = `${s.name} stamp${on ? "" : " (not earned yet)"}`;
  if (set.shape === "visa") return `<svg class="stamp-art visa ${on ? "on" : "off"}" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label}">${visaSVG(s, on, id, date)}</svg>`;
  const icon = (ICONS[sealed ? "envelope" : s.icon] || "").replace(/ACC/g, on ? set.accent : "currentColor");
  const name = (sealed ? "SEALED" : s.label || s.name).toUpperCase();
  let body;
  if (set.shape === "round") {
    const rim = ((s.rim || "SOMEWHERE") + (on && date ? ` · ${date}` : "")).toUpperCase();
    body = `<defs><path id="${id}t" d="M14 50a36 36 0 0 1 72 0"/><path id="${id}b" d="M11.5 50a38.5 38.5 0 0 0 77 0"/></defs>
      <text font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="9.5" letter-spacing="1" fill="currentColor"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">${name}</textPath></text>
      <text font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="6.6" letter-spacing="1.2" fill="currentColor"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${rim}</textPath></text>
      <g transform="translate(50 51) scale(.78) translate(-50 -47)">${icon}</g>`;
  } else {
    const ny = set.shape === "rect" ? 67 : set.shape === "hex" ? 67 : 68, maxW = set.shape === "rect" ? 66 : set.shape === "hex" ? 50 : 56;
    const fit = name.length > (set.shape === "rect" ? 12 : 8) ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : "";
    const sub = on ? (date || s.rim || "") : (s.rim || "");
    body = `<g transform="translate(50 ${set.shape === "rect" ? 38 : 40}) scale(.72) translate(-50 -47)">${icon}</g>
      <text x="50" y="${ny}" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="8.5" letter-spacing=".8" fill="currentColor"${fit}>${name}</text>
      ${sub ? `<text x="50" y="${ny + (set.shape === "rect" ? 7.5 : 8)}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="800" font-size="5.2" letter-spacing="1.2" fill="${on ? set.accent : "currentColor"}">${sub.toUpperCase()}</text>` : ""}`;
  }
  return `<svg class="stamp-art ${on ? "on" : "off"}" viewBox="0 0 100 100" width="${size}" height="${size}" style="color:${on ? set.ink : "#bfae8a"}" role="img" aria-label="${label}">
    <g filter="url(#ink)">${SHAPES[set.shape](on).replace(/ACC/g, set.accent)}${body}</g></svg>`;
}
