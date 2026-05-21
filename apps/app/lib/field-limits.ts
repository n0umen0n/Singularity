export const MISSION_STATEMENT_MAX_LENGTH = 160;

export const FIELD_LIMITS = {
  search: 120,
  moneyAmount: 16,
  missionStatement: MISSION_STATEMENT_MAX_LENGTH,
  missionDescription: 1200,
  tokenSymbol: 8,
  fundingRequestName: 120,
  fundingRequestDescription: 2000,
  profileName: 80,
  profileDescription: 500,
  socialHandle: 80,
} as const;
