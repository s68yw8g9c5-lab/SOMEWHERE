// Shared game rules. Used by the browser AND by the server (Cloudflare Functions),
// so both always agree on today's puzzle and the score.
import { PUZZLES } from "./puzzles.js";

// Day #1 starts at midnight UTC on this date. Everyone on Earth switches together.
// Tip: set this to your launch day so your first public puzzle is #1.
export const LAUNCH_UTC = Date.UTC(2026, 10, 20);
export const MAX_CLUES = 5;
export const MAX_POINTS = 5000;
// Points multiplier for how many clues you opened before locking in.
export const CLUE_MULT = [1, 0.8, 0.6, 0.45, 0.3];

export function dayNumber(now = Date.now()) {
  return Math.max(1, Math.floor((now - LAUNCH_UTC) / 86400000) + 1);
}

export function nextPuzzleAt(now = Date.now()) {
  const day = dayNumber(now);
  return LAUNCH_UTC + day * 86400000;
}

const KEY = "somewhere";
function decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function puzzleFor(day) {
  return decode(PUZZLES[(day - 1) % PUZZLES.length]);
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function scoreFor(km, cluesUsed) {
  const base = km <= 25 ? MAX_POINTS : MAX_POINTS * Math.exp(-(km - 25) / 2000);
  return Math.round(base * CLUE_MULT[Math.min(Math.max(cluesUsed, 1), MAX_CLUES) - 1]);
}

// Five squares for the share text: how close you got.
export function proximitySquares(km) {
  const steps = [100, 500, 1500, 4000, 8000];
  const filled = steps.filter((s) => km <= s).length;
  const color = km <= 100 ? "🟩" : km <= 1500 ? "🟨" : "🟧";
  return color.repeat(filled) + "⬛".repeat(5 - filled);
}
