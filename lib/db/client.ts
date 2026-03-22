import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

function getDbPath() {
  return path.join(process.cwd(), "data", "app.db");
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function ensureSchema(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER NOT NULL,
      region_code TEXT NOT NULL,
      province_slug TEXT NOT NULL,
      resolved_persona TEXT NOT NULL,
      email TEXT,
      user_id TEXT
    );
  `);
}

export function getDb() {
  if (_db) return _db;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  ensureSchema(sqlite);
  _db = drizzle(sqlite, { schema });
  return _db;
}
