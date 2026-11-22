// Server-only puzzle lookup. The browser never gets this file, so the answers (place names,
// coordinates, facts, the book or movie title) stay on the server until a guess is made.
import LIST from "./puzzle-data.mjs";
import { DAY_PLAN, ROUNDS, dateFor, dayNumber, LAUNCH_UTC } from "../public/game.js";

const mmdd = (d) => String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");

let byDate = null;
function getDates() {
  if (!byDate) {
    byDate = {};
    for (const p of LIST) (byDate[p.date] = byDate[p.date] || []).push(p);
    const rank = { easy: 0, medium: 1, hard: 2 };
    for (const k in byDate) byDate[k].sort((a, b) => rank[a.level] - rank[b.level]);
  }
  return byDate;
}
// True when this day has its own riddles (otherwise earlier dates are reused).
export const hasDate = (day) => !!getDates()[mmdd(dateFor(day))];

// The 5 places for a given day: 1 easy, 2 medium, 2 hard. Every riddle is tied to a calendar
// date (MM-DD in tools/puzzles.json); days with no riddles of their own reuse earlier dates.
export function puzzlesFor(day) {
  const all = getDates();
  const keys = Object.keys(all).sort();
  const list = all[mmdd(dateFor(day))] || all[keys[(day - 1) % keys.length]];
  const pool = list.slice(), picked = [];
  for (const lv of DAY_PLAN) { const i = pool.findIndex((p) => p.level === lv); if (i < 0) return list.slice(0, ROUNDS); picked.push(pool.splice(i, 1)[0]); }
  return picked;
}

// Yesterday's game can still be finished for 15 minutes after midnight UTC.
export const GRACE_MS = 15 * 60 * 1000;
// Can this day still be played for the leaderboard? (If so, its answers are secret.)
export function isOpen(day, now = Date.now()) {
  const today = dayNumber(now);
  if (day >= today) return true;
  return day === today - 1 && now - (LAUNCH_UTC + (today - 1) * 86400000) < GRACE_MS;
}
