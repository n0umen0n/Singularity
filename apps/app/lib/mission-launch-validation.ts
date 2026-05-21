import { DEFAULT_DBC_TOTAL_SUPPLY, resolveMeteoraDbcLaunchConfig } from "@singularity/solana";
import { FIELD_LIMITS, MISSION_STATEMENT_MAX_LENGTH } from "@/lib/field-limits";
import { UserInputError } from "@/lib/user-input-error";

export type MissionLaunchValidationInput = {
  statement?: string;
  description?: string;
  tokenSymbol?: string;
  initialPurchaseUsdc?: number | string;
};

export type ValidatedMissionLaunchInput = {
  statement: string;
  description: string;
  tokenSymbol: string;
  initialPurchaseUsdc: number;
};

function parseInitialPurchaseUsdc(value: number | string | undefined) {
  if (value === undefined || value === "") return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new UserInputError("Initial purchase must be zero or a positive USDC amount.");
    }
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) return 0;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new UserInputError("Initial purchase must be zero or a positive USDC amount.");
  }

  return parsed;
}

export function validateMissionLaunchInput(input: MissionLaunchValidationInput): ValidatedMissionLaunchInput {
  const statement = input.statement?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  const tokenSymbol = input.tokenSymbol?.trim().toUpperCase() ?? "";

  if (!statement) {
    throw new UserInputError("Mission statement is required.");
  }
  if (statement.length > MISSION_STATEMENT_MAX_LENGTH) {
    throw new UserInputError(`Mission statement must be ${MISSION_STATEMENT_MAX_LENGTH} characters or fewer.`);
  }

  if (!description) {
    throw new UserInputError("Mission description is required.");
  }
  if (description.length > FIELD_LIMITS.missionDescription) {
    throw new UserInputError(`Mission description must be ${FIELD_LIMITS.missionDescription} characters or fewer.`);
  }

  if (!tokenSymbol) {
    throw new UserInputError("Token symbol is required.");
  }
  if (!/^[A-Z0-9]{2,8}$/.test(tokenSymbol)) {
    throw new UserInputError("Token symbol must be 2-8 uppercase letters or numbers.");
  }

  return {
    statement,
    description,
    tokenSymbol,
    initialPurchaseUsdc: parseInitialPurchaseUsdc(input.initialPurchaseUsdc),
  };
}

export function resolveMissionLaunchConfig(input: {
  initialPurchaseUsdc?: number;
  initialMarketCap?: number;
  migrationMarketCap?: number;
}) {
  try {
    return resolveMeteoraDbcLaunchConfig({
      totalSupply: DEFAULT_DBC_TOTAL_SUPPLY,
      initialPurchaseUsdc: input.initialPurchaseUsdc,
      initialMarketCap: input.initialMarketCap,
      migrationMarketCap: input.migrationMarketCap,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("initialPurchaseUsdc is too large")) {
      throw new UserInputError("Initial purchase is too large. Try a smaller USDC amount.");
    }
    throw error;
  }
}
