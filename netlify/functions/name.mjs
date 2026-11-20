// POST /api/name { day, player, name } : rename yourself on today's board.
import { db } from "../../lib/db.mjs";
import { json, cleanName, validPlayer, readJson, fail } from "../../lib/http.mjs";

export default async (req) => {
  const b = await readJson(req);
  if (!b || !validPlayer(b.player)) return json({ error: "bad player" }, { status: 400 });
  const name = cleanName(b.name);
  try {
    const sql = await db();
    await sql`UPDATE games SET name = ${name} WHERE day = ${Number(b.day) || 0} AND player = ${b.player}`;
    return json({ ok: true, name });
  } catch (e) { return fail(e); }
};

export const config = { path: "/api/name", method: "POST" };
