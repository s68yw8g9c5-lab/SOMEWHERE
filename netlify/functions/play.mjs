// POST /api/play  { day, player, name, rounds: [{ lat, lon, clues } x5], ms }
// Sent once, after the 5th round. The server recomputes every distance and score
// itself, so nobody can fake points.
import { dayNumber, puzzlesFor, distanceKm, scoreFor, maxFor, LAUNCH_UTC, MAX_CLUES, ROUNDS } from "../../public/game.js";
import { db } from "../../lib/db.mjs";
import { json, cleanName, validPlayer, readJson, fail } from "../../lib/http.mjs";

const GRACE_MS = 15 * 60 * 1000; // finish yesterday's game up to 15 min after midnight UTC
const BUCKET = 100;

export default async (req, context) => {
  const b = await readJson(req);
  if (!b) return json({ error: "bad json" }, { status: 400 });

  const now = Date.now();
  const today = dayNumber(now);
  const day = Number(b.day);
  const inGrace = day === today - 1 && now - (LAUNCH_UTC + (today - 1) * 86400000) < GRACE_MS;
  if (day !== today && !inGrace) return json({ error: "that game is closed" }, { status: 400 });
  if (!validPlayer(b.player)) return json({ error: "bad player" }, { status: 400 });
  if (!Array.isArray(b.rounds) || b.rounds.length !== ROUNDS) return json({ error: "need 5 rounds" }, { status: 400 });

  const places = puzzlesFor(day);
  const rounds = [];
  for (let i = 0; i < ROUNDS; i++) {
    const r = b.rounds[i] || {};
    const lat = Number(r.lat), lon = Number(r.lon), clues = Math.round(Number(r.clues));
    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return json({ error: "bad pin" }, { status: 400 });
    if (!(clues >= 1 && clues <= MAX_CLUES)) return json({ error: "bad clues" }, { status: 400 });
    const km = Math.round(distanceKm(lat, lon, places[i].lat, places[i].lon) * 10) / 10;
    rounds.push([Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4, clues, km, scoreFor(km, clues, maxFor(places[i]))]);
  }
  const km = Math.round(rounds.reduce((s, r) => s + r[3], 0) * 10) / 10;
  const score = rounds.reduce((s, r) => s + r[4], 0);
  const ms = Math.max(0, Math.min(86400000, Math.round(Number(b.ms) || 0)));

  const geo = context.geo || {};
  const cc = geo.country?.code || "";
  const country = /^[A-Z]{2}$/.test(cc) ? cc : "XX";
  // 0,0 means "unknown" (e.g. local testing), so leave those players off the map.
  const hasGeo = Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude) && (geo.latitude !== 0 || geo.longitude !== 0);
  const plat = hasGeo ? Math.round(geo.latitude * 10) / 10 : null;
  const plon = hasGeo ? Math.round(geo.longitude * 10) / 10 : null;
  const name = cleanName(b.name);

  try {
    const sql = await db();
    const inserted = await sql`
      INSERT INTO games (day, player, name, country, plat, plon, rounds, km, score, ms, created)
      VALUES (${day}, ${b.player}, ${name}, ${country}, ${plat}, ${plon}, ${sql.json(rounds)}, ${km}, ${score}, ${ms}, ${now})
      ON CONFLICT (day, player) DO NOTHING
      RETURNING 1`;
    const isNew = inserted.length === 1;

    if (isNew) {
      await sql.begin(async (tx) => {
        await tx`INSERT INTO g_totals (day, players, sum_km, sum_score) VALUES (${day}, 1, ${km}, ${score})
                 ON CONFLICT (day) DO UPDATE SET players = g_totals.players + 1,
                   sum_km = g_totals.sum_km + ${km}, sum_score = g_totals.sum_score + ${score}`;
        await tx`INSERT INTO g_country (day, country, players, sum_score) VALUES (${day}, ${country}, 1, ${score})
                 ON CONFLICT (day, country) DO UPDATE SET players = g_country.players + 1,
                   sum_score = g_country.sum_score + ${score}`;
        await tx`INSERT INTO g_hist (day, bucket, players) VALUES (${day}, ${Math.floor(score / BUCKET)}, 1)
                 ON CONFLICT (day, bucket) DO UPDATE SET players = g_hist.players + 1`;
        if (plat != null && plon != null) {
          await tx`INSERT INTO g_cells (day, lat, lon, players)
                   VALUES (${day}, ${Math.round(plat * 2) / 2}, ${Math.round(plon * 2) / 2}, 1)
                   ON CONFLICT (day, lat, lon) DO UPDATE SET players = g_cells.players + 1`;
        }
      });
    }

    // Return the stored game (if they already played, this is their first result, not the new one).
    const [row] = await sql`SELECT name, country, rounds, km, score FROM games WHERE day = ${day} AND player = ${b.player}`;
    const [{ above }] = await sql`SELECT COALESCE(SUM(players), 0)::int AS above FROM g_hist
                                  WHERE day = ${day} AND bucket > ${Math.floor(row.score / BUCKET)}`;
    const [tot] = await sql`SELECT players FROM g_totals WHERE day = ${day}`;
    const players = tot?.players || 1;
    const beat = players > 1 ? Math.round(((players - 1 - above) / (players - 1)) * 100) : 100;

    return json({ ...row, day, players, beat: Math.max(0, Math.min(100, beat)), duplicate: !isNew });
  } catch (e) { return fail(e); }
};

export const config = { path: "/api/play", method: "POST" };
