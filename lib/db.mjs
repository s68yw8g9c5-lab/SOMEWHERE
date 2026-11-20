// Database helper. Works with any Postgres: Netlify DB (Neon), Neon, Supabase, or local.
import postgres from "postgres";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS plays (
  day     INTEGER NOT NULL,
  player  TEXT    NOT NULL,
  name    TEXT    NOT NULL,
  country TEXT,
  plat    DOUBLE PRECISION,           -- rough player location (city level)
  plon    DOUBLE PRECISION,
  glat    DOUBLE PRECISION NOT NULL,  -- the pin they dropped
  glon    DOUBLE PRECISION NOT NULL,
  clues   INTEGER NOT NULL,
  km      DOUBLE PRECISION NOT NULL,
  score   INTEGER NOT NULL,
  ms      INTEGER NOT NULL DEFAULT 0,
  created BIGINT  NOT NULL,
  PRIMARY KEY (day, player)
);
CREATE INDEX IF NOT EXISTS plays_top    ON plays (day, score DESC, ms ASC);
CREATE INDEX IF NOT EXISTS plays_recent ON plays (day, created DESC);
CREATE TABLE IF NOT EXISTS day_totals (
  day INTEGER PRIMARY KEY,
  players INTEGER NOT NULL DEFAULT 0,
  sum_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  sum_score BIGINT NOT NULL DEFAULT 0,
  c1 INTEGER NOT NULL DEFAULT 0, c2 INTEGER NOT NULL DEFAULT 0, c3 INTEGER NOT NULL DEFAULT 0,
  c4 INTEGER NOT NULL DEFAULT 0, c5 INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS day_country (
  day INTEGER NOT NULL, country TEXT NOT NULL,
  players INTEGER NOT NULL DEFAULT 0, sum_score BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country)
);
CREATE TABLE IF NOT EXISTS day_cells (
  day INTEGER NOT NULL, lat DOUBLE PRECISION NOT NULL, lon DOUBLE PRECISION NOT NULL,
  players INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, lat, lon)
);
CREATE TABLE IF NOT EXISTS day_hist (
  day INTEGER NOT NULL, bucket INTEGER NOT NULL,
  players INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, bucket)
);`;

let sql, ready;

// Returns a ready-to-use database connection. Creates the tables the first time,
// so there is no separate "set up the database" step.
export async function db() {
  if (!sql) {
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("No database connected. Set NETLIFY_DATABASE_URL or DATABASE_URL.");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    sql = postgres(url, { max: 1, idle_timeout: 20, prepare: false, ssl: local ? false : "require" });
  }
  if (!ready) ready = sql.unsafe(SCHEMA).catch((e) => { ready = null; throw e; });
  await ready;
  return sql;
}
