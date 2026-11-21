// Scout's Passport: ink stamps players collect by playing. All of it lives in the browser.
// Four sets, each with its own stamp shape and ink: habit, skill, collecting and surprise.
import { dateFor, speedFactor } from "./game.js";

export const SETS = [
  { id: "location", name: "On Location", blurb: "Show up, day after day.", shape: "round", ink: "#2f4a35" },
  { id: "sharp", name: "Sharpshooter", blurb: "Moments to be proud of.", shape: "oval", ink: "#c95a24" },
  { id: "journal", name: "Field Journal", blurb: "Your log of shows.", shape: "rect", ink: "#7a5233" },
  { id: "sealed", name: "Sealed Envelopes", blurb: "Secret stamps. Open them to find out.", shape: "hex", ink: "#2f7a6b" },
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
const streakStamp = (n) => ({ test: (c) => c.streak.count >= n, progress: (c) => [c.streak.count, n], unit: "day" });
const playedStamp = (n) => ({ test: (c) => c.played >= n, progress: (c) => [c.played, n], unit: "game" });

// c = { day, score, played, streak, prev, hour, rounds: [{ km, score, secs, level }] | null }
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

  { id: "bullseye", set: "sharp", name: "Bullseye", icon: "crosshair", rule: "Drop a pin within 25 km of a place.",
    note: "Right on the mark. Print that one!", test: (c) => rounds(c).some((r) => r.km <= 25) },
  { id: "eagle-eye", set: "sharp", name: "Eagle Eye", icon: "feather", rule: "Drop a pin within 1 km of a place.",
    note: "Under a kilometer. Were you there for the shoot?", test: (c) => rounds(c).some((r) => r.km <= 1) },
  { id: "golden-hour", set: "sharp", name: "Golden Hour", icon: "sun", rule: "Score 4,000 or more in one day.",
    note: "Four thousand points. That's golden-hour light.", test: (c) => c.score >= 4000 },
  { id: "directors-cut", set: "sharp", name: "Director's Cut", icon: "megaphone", rule: "Score 4,750 or more in one day.",
    note: "That's the director's cut. Not a frame wasted.", test: (c) => c.score >= 4750 },
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
  return days.map((d, i) => ({ day: d, score: h[d], played: i + 1, streak: streakAt(h, d), prev: i ? days[i - 1] : null, hour: null, rounds: null }));
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
const T = (x, y, s, t) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="${s}" fill="currentColor">${t}</text>`;
const ICONS = {
  clapper: `<path ${S} d="M31 44h38v22H31z"/><path ${S} d="M30 40l36-10 2 7-36 10z"/><path ${S} stroke-width="3" d="M41 36.5l4 6M52 33.5l4 6"/>`,
  three: `<rect ${S} x="33" y="27" width="34" height="40" rx="3"/><path ${F} d="M37 31h3v4h-3zM37 59h3v4h-3zM60 31h3v4h-3zM60 59h3v4h-3z"/>${T(50, 58, 26, "3")}`,
  chair: `<path ${S} d="M35 28v22M65 28v22M35 31h30v12H35M31 50h38M37 50l26 17M63 50L37 67"/>${T(50, 41.5, 11, "7")}`,
  reels: `<circle ${S} cx="38" cy="47" r="11"/><circle ${S} cx="62" cy="47" r="11"/><g ${F}><circle cx="38" cy="41.5" r="2.6"/><circle cx="62" cy="41.5" r="2.6"/><circle cx="38" cy="52.5" r="2.6"/><circle cx="62" cy="52.5" r="2.6"/><circle cx="32.5" cy="47" r="2.6"/><circle cx="67.5" cy="47" r="2.6"/><circle cx="43.5" cy="47" r="2.6"/><circle cx="56.5" cy="47" r="2.6"/></g>`,
  tent: `<path ${S} d="M30 66l20-30 20 30zM50 36v30M44 66l6-11 6 11"/><path ${S} stroke-width="2.5" d="M27 32q23-9 46 0"/><path ${F} d="M33 30l3 7 3-8zM45 27l3 7 3-7zM57 27l3 7 3-6z"/>`,
  comeback: `<path ${S} d="M37 56a15 15 0 1 0 1-17"/><path ${S} d="M36 30v10h10"/><path ${F} d="${star(52, 48, 7)}"/>`,
  mask: `<path ${F} d="M28 42q22-10 44 0 2 15-11 15-7 0-11-7-4 7-11 7-13 0-11-15z"/><ellipse cx="40" cy="47" rx="5" ry="3.5" fill="#fbf6ea"/><ellipse cx="60" cy="47" rx="5" ry="3.5" fill="#fbf6ea"/><path ${S} stroke-width="3" d="M28 42l-6-3M72 42l6-3"/>`,
  crosshair: `<circle ${S} cx="50" cy="47" r="16"/><path ${S} stroke-width="3" d="M50 25v10M50 59v10M28 47h10M62 47h10"/><circle ${F} cx="50" cy="47" r="4"/>`,
  feather: `<path ${S} d="M64 28c6 14-2 28-22 32 0-14 8-26 22-32zM36 66l20-26"/><path ${S} stroke-width="2.5" d="M47 52l-6-2M52 45l-5-3M57 38l-4-3"/>`,
  sun: `<path ${S} d="M37 54a13 13 0 0 1 26 0"/><path ${S} stroke-width="3" d="M50 31v5M34 37l3.5 3.5M66 37l-3.5 3.5M28 50h4M68 50h4"/><path ${S} d="M27 62q12-9 23-2 12-8 23 2"/>`,
  megaphone: `<path ${S} d="M30 43v10h7l17 10V33L37 43z"/><path ${F} d="${star(64, 34, 6)}"/><path ${F} d="${star(70, 50, 4.5)}"/><path ${F} d="${star(63, 62, 3.5)}"/>`,
  stopwatch: `<circle ${S} cx="54" cy="50" r="15"/><path ${S} d="M54 50v-8M54 50l6 4M50 30h8M54 30v5"/><path ${S} stroke-width="3" d="M26 44h9M24 52h8M27 60h8"/>`,
  twist: `<path ${S} d="M40 37a9 9 0 1 1 13 8c-3 2-3 4-3 7"/><circle ${F} cx="50" cy="60" r="3"/><path ${S} d="M58 58q10-2 10-12M64 50l4-5 4 5"/>`,
  pins: `<path ${F} d="${pin(30, 50)}${pin(40, 50)}${pin(50, 50)}${pin(60, 50)}${pin(70, 50)}"/><path ${S} stroke-width="3" d="M26 62h48"/>`,
  ticket1: `<path ${S} d="M28 34h44v8a5 5 0 0 0 0 10v8H28v-8a5 5 0 0 0 0-10z"/><path ${S} stroke-width="2" stroke-dasharray="2 3" d="M40 35v24"/>${T(57, 54.5, 19, "I")}`,
  ticket2: `<path ${S} d="M28 34h44v8a5 5 0 0 0 0 10v8H28v-8a5 5 0 0 0 0-10z"/><path ${S} stroke-width="2" stroke-dasharray="2 3" d="M40 35v24"/>${T(57, 54.5, 19, "II")}`,
  premiere: `<path ${F} d="${star(50, 45, 16)}"/><path ${S} stroke-width="3" d="M50 22v-3M31 30l-2-2M69 30l2-2M27 48h-3M73 48h3"/>`,
  moon: `<path ${F} d="M58 28a19 19 0 1 0 10 30 15 15 0 0 1-10-30z"/><path ${F} d="${star(66, 36, 4)}"/><path ${F} d="${star(72, 48, 3)}"/>`,
  loop: `<path ${S} stroke-width="3" stroke-dasharray="1 6" d="M28 62c0-14 30-8 28-22-1-10-16-8-14 1 2 10 22 12 22-6"/><path ${F} d="${pin(66, 33)}"/>`,
  snowflake: `<path ${S} d="M50 28v38M34 37l32 20M66 37L34 57"/><path ${S} stroke-width="3" d="M45 30l5 5 5-5M45 64l5-5 5 5M33 43l6-1-1-6M67 51l-6 1 1 6M67 43l-6-1 1-6M33 51l6 1-1 6"/>`,
  envelope: `<rect ${S} x="29" y="34" width="42" height="28" rx="2"/><path ${S} d="M29 36l21 14 21-14"/><circle ${F} cx="50" cy="51" r="6"/>`,
};

let uid = 0;
const SHAPES = {
  round: (inkOn) => `<circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="3.5"${inkOn ? "" : ' stroke-dasharray="5 4"'}/><circle cx="50" cy="50" r="33" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  oval: (inkOn) => `<ellipse cx="50" cy="50" rx="47" ry="38" fill="none" stroke="currentColor" stroke-width="3.5"${inkOn ? "" : ' stroke-dasharray="5 4"'}/><ellipse cx="50" cy="50" rx="41" ry="32" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  rect: (inkOn) => `<rect x="5" y="13" width="90" height="74" rx="7" fill="none" stroke="currentColor" stroke-width="3.5"${inkOn ? "" : ' stroke-dasharray="5 4"'}/><rect x="11" y="19" width="78" height="62" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2.5"/>`,
  hex: (inkOn) => `<path d="M50 4l40 23v46L50 96 10 73V27z" fill="none" stroke="currentColor" stroke-width="3.5"${inkOn ? "" : ' stroke-dasharray="5 4"'}/><path d="M50 12l33 19v38L50 88 17 69V31z" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
};

// on: earned (full ink). Off: a faint dotted outline. A sealed stamp that's not earned shows an envelope.
export function stampSVG(s, on = true, size = 96) {
  const set = setOf(s), id = `st${++uid}`, sealed = !on && set.id === "sealed";
  const icon = ICONS[sealed ? "envelope" : s.icon] || "";
  const name = (sealed ? "SEALED" : s.label || s.name).toUpperCase();
  let body;
  if (set.shape === "round") {
    const rim = (s.rim || "SOMEWHERE").toUpperCase();
    body = `<defs><path id="${id}t" d="M14 50a36 36 0 0 1 72 0"/><path id="${id}b" d="M10 50a40 40 0 0 0 80 0"/></defs>
      <text font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="9.5" letter-spacing="1" fill="currentColor"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">${name}</textPath></text>
      <text font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="7" letter-spacing="1.5" fill="currentColor"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${rim}</textPath></text>
      <g transform="translate(50 51) scale(.78) translate(-50 -47)">${icon}</g>`;
  } else {
    const ny = set.shape === "rect" ? 74 : set.shape === "hex" ? 69 : 70, maxW = set.shape === "rect" ? 66 : set.shape === "hex" ? 50 : 56;
    const fit = name.length > (set.shape === "rect" ? 12 : 8) ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : "";
    body = `<g transform="translate(50 ${set.shape === "rect" ? 44 : 42}) scale(.72) translate(-50 -47)">${icon}</g>
      <text x="50" y="${ny}" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="8.5" letter-spacing=".8" fill="currentColor"${fit}>${name}</text>`;
  }
  return `<svg class="stamp-art ${on ? "on" : "off"}" viewBox="0 0 100 100" width="${size}" height="${size}" style="color:${on ? set.ink : "#bfae8a"}" role="img" aria-label="${s.name} stamp${on ? "" : " (not earned yet)"}">
    <g filter="url(#ink)">${SHAPES[set.shape](on)}${body}</g></svg>`;
}
