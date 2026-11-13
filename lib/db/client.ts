import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { workersPostgres } from "./hyperdrive";
import { NODE_POSTGRES_OPTIONS } from "./postgres-options";

const globalForDb = globalThis as unknown as {
  pg: ReturnType<typeof postgres> | undefined;
};

function getPostgres() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set (Supabase PostgreSQL connection string)");
  }
  if (!globalForDb.pg) {
    globalForDb.pg = postgres(url, NODE_POSTGRES_OPTIONS);
  }
  return globalForDb.pg;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  const workers = workersPostgres();
  if (workers) return drizzle(workers, { schema });
  if (_db) return _db;
  _db = drizzle(getPostgres(), { schema });
  return _db;
}
