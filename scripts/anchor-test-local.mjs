import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const workspaceDeployDir = path.join(root, "target", "deploy");
const cargoTargetDir = process.env.CARGO_TARGET_DIR
  ? path.resolve(root, process.env.CARGO_TARGET_DIR)
  : path.join(root, "target");
const cargoDeployDir = path.join(cargoTargetDir, "deploy");

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function copySbfArtifacts() {
  mkdirSync(workspaceDeployDir, { recursive: true });

  const candidates = [workspaceDeployDir, cargoDeployDir].filter((dir, index, dirs) => existsSync(dir) && dirs.indexOf(dir) === index);
  const artifacts = candidates.flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => file.endsWith(".so"))
      .map((file) => ({ source: path.join(dir, file), target: path.join(workspaceDeployDir, file) })),
  );

  if (artifacts.length === 0) {
    console.error(`No SBF artifacts found in ${candidates.join(" or ")}.`);
    process.exit(1);
  }

  for (const artifact of artifacts) {
    if (artifact.source !== artifact.target) {
      copyFileSync(artifact.source, artifact.target);
    }
  }
}

run("anchor", ["build"], {
  SINGULARITY_COUNCIL_AUTHORITY_PUBKEY:
    process.env.SINGULARITY_COUNCIL_AUTHORITY_PUBKEY || "8F7YpepKxP1xc9Nqscdh6SSs5X7DmtPWUjUGViYShCxQ",
});
copySbfArtifacts();
run("anchor", ["test", "--skip-build"], {
  ANCHOR_PROVIDER_URL: process.env.ANCHOR_PROVIDER_URL || "http://127.0.0.1:8899",
  ANCHOR_WALLET: process.env.ANCHOR_WALLET || path.join(process.env.HOME || "", ".config", "solana", "id.json"),
});
