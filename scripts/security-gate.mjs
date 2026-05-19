const requiredProductionEnv = [
  "DATABASE_URL",
  "SINGULARITY_STORAGE",
  "SOLANA_RPC_URL",
  "SINGULARITY_REGISTRY_PROGRAM_ID",
  "SINGULARITY_COUNCIL_PROGRAM_ID",
  "BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET",
  "SINGULARITY_SESSION_SECRET",
];

const placeholderProgramIds = new Set([
  "Reg1111111111111111111111111111111111111111",
  "Cou1111111111111111111111111111111111111111",
  "",
]);

const missing = requiredProductionEnv.filter((key) => !process.env[key]);
const unsafeProgramIds = ["SINGULARITY_REGISTRY_PROGRAM_ID", "SINGULARITY_COUNCIL_PROGRAM_ID"].filter((key) =>
  placeholderProgramIds.has(process.env[key] || ""),
);

if (process.env.CI_PRODUCTION_GATE === "true") {
  if (missing.length > 0) {
    console.error(`Missing production environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  if (process.env.SINGULARITY_STORAGE !== "postgres") {
    console.error("SINGULARITY_STORAGE must be postgres for production.");
    process.exit(1);
  }

  if (unsafeProgramIds.length > 0) {
    console.error(`Placeholder Solana program IDs are not allowed in production: ${unsafeProgramIds.join(", ")}`);
    process.exit(1);
  }
}

console.log("Security gate passed for current CI mode.");
