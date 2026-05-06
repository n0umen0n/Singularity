import pg from "pg";
import { databaseSslConfig } from "@/lib/backend/env";

const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var singularityPgPool: pg.Pool | undefined;
}

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Postgres storage.");
  }

  globalThis.singularityPgPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: databaseSslConfig(),
  });

  return globalThis.singularityPgPool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export async function transaction<T>(callback: (client: pg.PoolClient) => Promise<T>) {
  const client = await getPool().connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
