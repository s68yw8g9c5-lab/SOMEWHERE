// Shared game rules. Used by the browser AND by the server (Netlify Functions),
// so both always agree on today's places and the score.
import { PUZZLES } from "./puzzles.js";

// Day #1 starts at midnight UTC on this date. Everyone on Earth switches together.
// Tip: set this to your launch day so your first public game is #1.
export const LAUNCH_UTC = Date.UTC(2026, 10, 20);
export const ROUNDS = 5;            // places per day
export const MAX_CLUES = 3;         // clues per place
export const MAX_POINTS = 1000;     // a medium round (and a friend's riddle)
// Every day climbs: 1 easy, 2 medium, then 2 hard riddles (the last is the "boss"). Harder = more points.
export const LEVELS = {
  easy:   { label: "Easy",   max: 600 },
  medium: { label: "Medium", max: 900 },
  hard:   { label: "Hard",   max: 1300 },
};
export const DAY_PLAN = ["easy", "medium", "medium", "hard", "hard"];
export const MAX_TOTAL = DAY_PLAN.reduce((s, l) => s + LEVELS[l].max, 0); // 5,000
export const HARD_ROUND = DAY_PLAN.lastIndexOf("hard"); // the boss riddle
export const maxFor = (p) => (LEVELS[p && p.level] || LEVELS.medium).max;
// Points multiplier for how many clues you opened before guessing.
export const CLUE_MULT = [1, 0.7, 0.4];

export function dayNumber(now = Date.now()) {
  return Math.max(1, Math.floor((now - LAUNCH_UTC) / 86400000) + 1);
}

export function nextPuzzleAt(now = Date.now()) {
  return LAUNCH_UTC + dayNumber(now) * 86400000;
}

const KEY = "somewhere";
function decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length);
  return JSON.parse(new TextDecoder().decode(bytes));
}

// The 5 places for a given day, easy to hard. 150 riddles (60 easy, 60 medium,
// 30 hard) = 30 days before they repeat.
// "On this day in history": every riddle is tied to a calendar date (MM-DD), and
// day N of the game shows that date's 5 events, easy to hard.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const dateFor = (day) => new Date(LAUNCH_UTC + (day - 1) * 86400000);
export const dateLabel = (day) => { const d = dateFor(day); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const mmdd = (d) => String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");

let byDate = null;
function getDates() {
  if (!byDate) {
    byDate = {};
    for (const enc of PUZZLES) { const p = decode(enc); (byDate[p.date] = byDate[p.date] || []).push(p); }
    const rank = { easy: 0, medium: 1, hard: 2 };
    for (const k in byDate) byDate[k].sort((a, b) => rank[a.level] - rank[b.level]);
  }
  return byDate;
}
// True when this day has its own "on this day" riddles (otherwise older dates are reused).
export const hasDate = (day) => !!getDates()[mmdd(dateFor(day))];

export function puzzlesFor(day) {
  const all = getDates();
  const keys = Object.keys(all).sort();
  const list = all[mmdd(dateFor(day))] || all[keys[(day - 1) % keys.length]];
  // Follow the day plan when the date has the right mix; otherwise keep the date's own order.
  const pool = list.slice(), picked = [];
  for (const lv of DAY_PLAN) { const i = pool.findIndex((p) => p.level === lv); if (i < 0) return list.slice(0, ROUNDS); picked.push(pool.splice(i, 1)[0]); }
  return picked;
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Speed: distance earns 80% of a round's points, speed earns the last 20%.
// Answer within 20 seconds for the whole speed bonus; it fades to nothing at 2 minutes.
export const SPEED = { full: 20, zero: 120, share: 0.2 };
export function speedFactor(secs) {
  if (!Number.isFinite(secs) || secs < 0) return 0;
  return Math.max(0, Math.min(1, (SPEED.zero - secs) / (SPEED.zero - SPEED.full)));
}

export function scoreFor(km, cluesUsed, max = MAX_POINTS, secs = 0) {
  const base = km <= 25 ? max : max * Math.exp(-(km - 25) / 2000);
  const speed = 1 - SPEED.share + SPEED.share * speedFactor(secs);
  return Math.round(base * CLUE_MULT[Math.min(Math.max(cluesUsed, 1), MAX_CLUES) - 1] * speed);
}

// One square per round for the share text: how close you got.
export function roundSquare(km) {
  return km <= 100 ? "🟩" : km <= 750 ? "🟨" : km <= 2500 ? "🟧" : km <= 6000 ? "🟥" : "⬛";
}
