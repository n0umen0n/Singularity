import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run database migrations.");
  process.exit(1);
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(currentDir, "..", "schema.sql");
const schema = await readFile(schemaPath, "utf8");
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

try {
  await pool.query(schema);
  console.log("Singularity database schema is up to date.");
} finally {
  await pool.end();
}
