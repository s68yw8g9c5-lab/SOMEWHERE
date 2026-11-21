// Database helper. Works with any Postgres: Netlify DB (Neon), Neon, Supabase, or local.
import postgres from "postgres";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  day     INTEGER NOT NULL,
  player  TEXT    NOT NULL,
  name    TEXT    NOT NULL,
  country TEXT,
  plat    DOUBLE PRECISION,           -- rough player location (city level)
  plon    DOUBLE PRECISION,
  rounds  JSONB   NOT NULL,           -- [[lat, lon, clues, km, score], ...] one per round
  km      DOUBLE PRECISION NOT NULL,  -- total distance over all rounds
  score   INTEGER NOT NULL,           -- total score out of 5,000
  ms      INTEGER NOT NULL DEFAULT 0,
  created BIGINT  NOT NULL,
  PRIMARY KEY (day, player)
);
CREATE INDEX IF NOT EXISTS games_top    ON games (day, score DESC, ms ASC);
CREATE INDEX IF NOT EXISTS games_recent ON games (day, created DESC);
CREATE TABLE IF NOT EXISTS g_totals (
  day INTEGER PRIMARY KEY,
  players INTEGER NOT NULL DEFAULT 0,
  sum_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  sum_score BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS g_country (
  day INTEGER NOT NULL, country TEXT NOT NULL,
  players INTEGER NOT NULL DEFAULT 0, sum_score BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country)
);
CREATE TABLE IF NOT EXISTS g_cells (
  day INTEGER NOT NULL, lat DOUBLE PRECISION NOT NULL, lon DOUBLE PRECISION NOT NULL,
  players INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, lat, lon)
);
-- Score histogram in 100-point buckets, used to say "you beat 82% of players".
CREATE TABLE IF NOT EXISTS g_hist (
  day INTEGER NOT NULL, bucket INTEGER NOT NULL,
  players INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, bucket)
);
-- Friends boards: a private code that a group of players share.
CREATE TABLE IF NOT EXISTS friends (
  code   TEXT   NOT NULL,
  player TEXT   NOT NULL,
  name   TEXT   NOT NULL,
  joined BIGINT NOT NULL,
  PRIMARY KEY (code, player)
);
CREATE INDEX IF NOT EXISTS friends_player ON friends (player);
-- Messages from the feedback box in the "How to play" window.
CREATE TABLE IF NOT EXISTS feedback (
  id      SERIAL PRIMARY KEY,
  msg     TEXT   NOT NULL,
  contact TEXT,
  country TEXT,
  day     INTEGER,
  created BIGINT NOT NULL
);`;

let sql, ready;

// Returns a ready-to-use database connection. Creates the tables the first time,
// so there is no separate "set up the database" step.
export async function db() {
  if (!sql) {
    let url = (process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || "").trim();
    if (!url) throw new Error("No database connected. Set NETLIFY_DATABASE_URL or DATABASE_URL.");
    // Neon's copy button adds channel_binding=require, which the postgres library would pass to
    // the server as an unknown setting. Drop it; the connection is still encrypted (ssl: require).
    try { const u = new URL(url); u.searchParams.delete("channel_binding"); url = u.toString(); } catch {}
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    sql = postgres(url, { max: 1, idle_timeout: 20, prepare: false, ssl: local ? false : "require" });
  }
  if (!ready) ready = sql.unsafe(SCHEMA).catch((e) => { ready = null; throw e; });
  await ready;
  return sql;
}
