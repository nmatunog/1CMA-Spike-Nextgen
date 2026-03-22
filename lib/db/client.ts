import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pg: ReturnType<typeof postgres> | undefined;
};

function getPostgres() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set (Supabase PostgreSQL connection string)");
  }
  if (!globalForDb.pg) {
    globalForDb.pg = postgres(url, {
      max: 1,
      prepare: false,
    });
  }
  return globalForDb.pg;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  _db = drizzle(getPostgres(), { schema });
  return _db;
}
