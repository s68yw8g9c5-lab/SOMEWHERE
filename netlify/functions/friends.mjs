// Friends boards. A board is just a short private code that friends share by link.
//   POST /api/friends { action: "create" | "join" | "leave", code?, player, name }
//   GET  /api/friends?code=ABC123&day=N&player=...  -> today's scores for everyone on the board
import { dayNumber, HARD_ROUND, LEVELS } from "../../public/game.js";
import { db } from "../../lib/db.mjs";
import { json, cleanName, validPlayer, readJson, fail } from "../../lib/http.mjs";

const MAX_MEMBERS = 200;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I mix-ups
const validCode = (c) => typeof c === "string" && /^[A-Z2-9]{6}$/.test(c);
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join("");

export default async (req) => {
  try {
    const sql = await db();
    if (req.method === "GET") {
      const url = new URL(req.url);
      const code = (url.searchParams.get("code") || "").toUpperCase();
      const player = url.searchParams.get("player");
      if (!validCode(code)) return json({ error: "bad code" }, { status: 400 });
      const day = Math.min(Math.max(1, Math.round(Number(url.searchParams.get("day")) || dayNumber())), dayNumber());
      const rows = await sql`
        SELECT f.player, COALESCE(g.name, f.name) AS name, g.country, g.score, g.km, (g.rounds->${HARD_ROUND}->>4)::int AS hard
        FROM friends f LEFT JOIN games g ON g.day = ${day} AND g.player = f.player
        WHERE f.code = ${code}
        ORDER BY g.score DESC NULLS LAST, f.joined ASC
        LIMIT ${MAX_MEMBERS}`;
      // Never send other players' ids back, only a "this is you" flag.
      return json({
        code, day, members: rows.length,
        board: rows.map((r) => ({ name: r.name, country: r.country, score: r.score, km: r.km == null ? null : Number(r.km), me: r.player === player, cracked: r.hard != null && r.hard >= LEVELS.hard.max / 2 })),
      });
    }

    const b = await readJson(req);
    if (!b || !validPlayer(b.player)) return json({ error: "bad player" }, { status: 400 });
    const name = cleanName(b.name);
    if (b.action === "create") {
      for (let i = 0; i < 5; i++) {
        const code = newCode();
        const r = await sql`INSERT INTO friends (code, player, name, joined) VALUES (${code}, ${b.player}, ${name}, ${Date.now()})
                            ON CONFLICT DO NOTHING RETURNING 1`;
        if (r.length) return json({ code });
      }
      return json({ error: "try again" }, { status: 500 });
    }
    const code = String(b.code || "").toUpperCase();
    if (!validCode(code)) return json({ error: "bad code" }, { status: 400 });
    if (b.action === "join") {
      const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM friends WHERE code = ${code}`;
      if (n === 0) return json({ error: "no such board" }, { status: 404 });
      if (n >= MAX_MEMBERS) return json({ error: "board is full" }, { status: 409 });
      await sql`INSERT INTO friends (code, player, name, joined) VALUES (${code}, ${b.player}, ${name}, ${Date.now()})
                ON CONFLICT (code, player) DO UPDATE SET name = ${name}`;
      return json({ code });
    }
    if (b.action === "leave") {
      await sql`DELETE FROM friends WHERE code = ${code} AND player = ${b.player}`;
      return json({ ok: true });
    }
    return json({ error: "bad action" }, { status: 400 });
  } catch (e) { return fail(e); }
};

export const config = { path: "/api/friends", method: ["GET", "POST"] };
