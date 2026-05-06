export type StorageMode = "file" | "postgres";

export function storageMode(): StorageMode {
  if (process.env.SINGULARITY_STORAGE === "file") return "file";
  if (process.env.DATABASE_URL) return "postgres";
  return "file";
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function assertProductionStorage() {
  if (isProductionRuntime() && storageMode() !== "postgres") {
    throw new Error("Production requires DATABASE_URL or SINGULARITY_STORAGE=postgres. File storage is development-only.");
  }
}

export function databaseSslConfig() {
  return process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false };
}
