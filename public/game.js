// Shared game rules. Used by the browser AND by the server (Netlify Functions),
// so both always agree on today's places and the score.
import { PUZZLES } from "./puzzles.js";

// Day #1 starts at midnight UTC on this date. Everyone on Earth switches together.
// Tip: set this to your launch day so your first public game is #1.
export const LAUNCH_UTC = Date.UTC(2026, 10, 20);
export const ROUNDS = 5;            // places per day
export const MAX_CLUES = 3;         // clues per place
export const MAX_POINTS = 1000;     // per round
export const MAX_TOTAL = MAX_POINTS * ROUNDS;
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

// The 5 places for a given day. 150 riddles = 30 days before they repeat.
export function puzzlesFor(day) {
  return Array.from({ length: ROUNDS }, (_, r) => decode(PUZZLES[((day - 1) * ROUNDS + r) % PUZZLES.length]));
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

// One square per round for the share text: how close you got.
export function roundSquare(km) {
  return km <= 100 ? "🟩" : km <= 750 ? "🟨" : km <= 2500 ? "🟧" : km <= 6000 ? "🟥" : "⬛";
}
