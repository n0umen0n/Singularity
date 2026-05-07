import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ActivationType,
  BaseFeeMode,
  buildCurveWithMarketCap,
  CollectFeeMode,
  deriveDbcPoolAddress,
  DynamicBondingCurveClient,
  getCurrentPoint,
  getPriceFromSqrtPrice,
  MigrationFeeOption,
  MigrationOption,
  swapQuote,
  type PoolConfig,
  type SwapQuoteResult,
  TokenDecimal,
  TokenType,
  TokenUpdateAuthorityOption,
  type VirtualPool,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { BN } from "@coral-xyz/anchor";

export const DEFAULT_DBC_TOTAL_SUPPLY = 50_000_000;
export const DEFAULT_DBC_TREASURY_SUPPLY_PERCENT = 20;
export const DEFAULT_DBC_INITIAL_MARKET_CAP = 10_000;
export const DEFAULT_DBC_MIGRATION_MARKET_CAP = 65_000;

const DEFAULT_DBC_BUY_AMOUNTS_USDC = [5, 10, 25, 100, 1_000];
const DBC_GUARDRAILS = {
  maxTenUsdcTotalSupplyPercent: 0.5,
  maxHundredUsdcTotalSupplyPercent: 3,
  maxInitialPurchaseTotalSupplyPercent: 3,
  minMigrationMarketCapMultiple: 3,
};

export type SolanaProgramConfig = {
  rpcUrl: string;
  registryProgramId: string;
  councilProgramId: string;
};

export const DEFAULT_REGISTRY_PROGRAM_ID = "7CxZRBgnYwi5MtSKebmaSh7XTRVXk3QgzjXRUgLzcXT5";
export const DEFAULT_COUNCIL_PROGRAM_ID = "4k7JhCHjs2uoiP1hmvYDawnwJuXMt5ZhUJotvMRqedKS";

export type PreparedSolanaTransaction = {
  kind: string;
  status: "ready";
  network: "mainnet-beta";
  feePayer: string;
  blockhash: string;
  transactionBase64: string;
  transactions?: Array<{
    label?: string;
    transactionBase64: string;
    requiredSigners: string[];
  }>;
  accounts?: Record<string, string>;
  instructions: Array<{
    programId: string;
    accounts: string[];
    dataBase64: string;
  }>;
  requiredSigners: string[];
};

export type TransactionBuildInput = {
  feePayer: string;
  recentBlockhash: string;
  instructions: TransactionInstruction[];
  kind: string;
  requiredSigners?: string[];
  signerKeypairs?: Keypair[];
  accounts?: Record<string, string>;
};

export type TransactionBuildStep = {
  label?: string;
  instructions: TransactionInstruction[];
  requiredSigners?: string[];
  signerKeypairs?: Keypair[];
};

export type MeteoraDbcLaunchInput = {
  rpcUrl: string;
  payer: string;
  poolCreator?: string;
  name: string;
  symbol: string;
  uri: string;
  quoteMint: string;
  feeClaimer: string;
  leftoverReceiver: string;
  totalSupply: number;
  treasurySupplyPercent?: number;
  initialPurchaseUsdc?: number;
  initialMarketCap?: number;
  migrationMarketCap?: number;
};

export type MeteoraDbcLaunchConfig = {
  totalSupply: number;
  treasurySupplyPercent: number;
  initialMarketCap: number;
  migrationMarketCap: number;
  initialPurchaseUsdc: number;
};

export type MeteoraDbcLaunchSimulationInput = Partial<MeteoraDbcLaunchConfig> & {
  buyAmountsUsdc?: number[];
};

export type MeteoraDbcLaunchSimulationQuote = {
  buyAmountUsdc: number;
  tokensOut: number;
  totalSupplyPercent: number;
  marketSupplyPercent: number;
  averagePriceUsdc: number;
  startingSpotPriceUsdc: number;
  endingSpotPriceUsdc: number;
  priceImpactPercent: number;
  poolProgressPercent: number;
};

export type MeteoraDbcLaunchSimulation = {
  config: MeteoraDbcLaunchConfig;
  marketSupply: number;
  treasurySupply: number;
  migrationQuoteThresholdUsdc: number;
  virtualDepthUsd: number;
  quotes: MeteoraDbcLaunchSimulationQuote[];
  guardrails: {
    passed: boolean;
    failures: string[];
  };
};

export type MeteoraDbcTradeSide = "buy" | "sell";

export type MeteoraDbcQuote = {
  route: "meteora-dbc";
  side: MeteoraDbcTradeSide;
  inputAmount: number;
  estimatedOutput: number;
  minimumAmountOut: number;
  priceImpactPercent: number;
  currentPrice: number;
  inputMint: string;
  outputMint: string;
  baseMint: string;
  quoteMint: string;
  dbcPool: string;
  baseReserve: number;
  quoteReserve: number;
  liquidityUsd: number;
  poolProgressPercent: number;
  baseDecimals: number;
  quoteDecimals: number;
};

export type MeteoraDbcMarketSnapshot = {
  route: "meteora-dbc";
  dbcPool: string;
  baseMint: string;
  quoteMint: string;
  currentPrice: number;
  baseReserve: number;
  quoteReserve: number;
  liquidityUsd: number;
  poolProgressPercent: number;
  treasuryTokens: number;
  treasuryUsdc: number;
  holders: number;
  totalSupply: number;
  circulatingTokens: number;
  marketTokens: number;
  updatedAt: string;
};

export type MeteoraDbcTradeResult = MeteoraDbcQuote & {
  transaction: PreparedSolanaTransaction;
};

function finitePositive(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

export function resolveMeteoraDbcLaunchConfig(input: Partial<MeteoraDbcLaunchConfig> = {}): MeteoraDbcLaunchConfig {
  const totalSupply = finitePositive(input.totalSupply, DEFAULT_DBC_TOTAL_SUPPLY);
  const treasurySupplyPercent = finitePositive(input.treasurySupplyPercent, DEFAULT_DBC_TREASURY_SUPPLY_PERCENT);
  const initialMarketCap = finitePositive(input.initialMarketCap, DEFAULT_DBC_INITIAL_MARKET_CAP);
  const migrationMarketCap = finitePositive(input.migrationMarketCap, DEFAULT_DBC_MIGRATION_MARKET_CAP);
  const initialPurchaseUsdc = Math.max(Number(input.initialPurchaseUsdc || 0), 0);

  if (treasurySupplyPercent <= 0 || treasurySupplyPercent >= 90) {
    throw new Error("treasurySupplyPercent must be greater than 0 and less than 90.");
  }
  if (migrationMarketCap <= initialMarketCap) {
    throw new Error("migrationMarketCap must be greater than initialMarketCap.");
  }
  if (migrationMarketCap < initialMarketCap * DBC_GUARDRAILS.minMigrationMarketCapMultiple) {
    throw new Error(`migrationMarketCap must be at least ${DBC_GUARDRAILS.minMigrationMarketCapMultiple}x initialMarketCap.`);
  }

  const tenUsdcPercent = (10 / initialMarketCap) * 100;
  if (tenUsdcPercent > DBC_GUARDRAILS.maxTenUsdcTotalSupplyPercent) {
    throw new Error(`initialMarketCap is too low: a 10 USDC spot buy would exceed ${DBC_GUARDRAILS.maxTenUsdcTotalSupplyPercent}% of total supply.`);
  }

  const hundredUsdcPercent = (100 / initialMarketCap) * 100;
  if (hundredUsdcPercent > DBC_GUARDRAILS.maxHundredUsdcTotalSupplyPercent) {
    throw new Error(`initialMarketCap is too low: a 100 USDC spot buy would exceed ${DBC_GUARDRAILS.maxHundredUsdcTotalSupplyPercent}% of total supply.`);
  }

  const initialPurchasePercent = initialPurchaseUsdc > 0 ? (initialPurchaseUsdc / initialMarketCap) * 100 : 0;
  if (initialPurchasePercent > DBC_GUARDRAILS.maxInitialPurchaseTotalSupplyPercent) {
    throw new Error(`initialPurchaseUsdc is too large for this curve: it would exceed ${DBC_GUARDRAILS.maxInitialPurchaseTotalSupplyPercent}% of total supply at spot.`);
  }

  return {
    totalSupply,
    treasurySupplyPercent,
    initialMarketCap,
    migrationMarketCap,
    initialPurchaseUsdc,
  };
}

function buildMeteoraDbcCurveConfig(input: Partial<MeteoraDbcLaunchConfig>) {
  const launchConfig = resolveMeteoraDbcLaunchConfig(input);
  const treasurySupply = Math.floor((launchConfig.totalSupply * launchConfig.treasurySupplyPercent) / 100);

  const curveConfig = buildCurveWithMarketCap({
    token: {
      tokenType: TokenType.Token2022,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.SIX,
      tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
      totalTokenSupply: launchConfig.totalSupply,
      leftover: treasurySupply,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: 100,
          endingFeeBps: 100,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: true,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 50,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: launchConfig.initialPurchaseUsdc > 0,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps100,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    liquidityDistribution: {
      partnerLiquidityPercentage: 0,
      partnerPermanentLockedLiquidityPercentage: 50,
      creatorLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 50,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Slot,
    initialMarketCap: launchConfig.initialMarketCap,
    migrationMarketCap: launchConfig.migrationMarketCap,
  });

  return { launchConfig, treasurySupply, curveConfig };
}

function migrationSqrtPrice(curveConfig: ReturnType<typeof buildCurveWithMarketCap>) {
  for (let index = curveConfig.curve.length - 1; index >= 0; index -= 1) {
    const sqrtPrice = curveConfig.curve[index]?.sqrtPrice;
    if (sqrtPrice && !sqrtPrice.isZero()) return sqrtPrice;
  }

  return curveConfig.sqrtStartPrice;
}

function initialVirtualPool(curveConfig: ReturnType<typeof buildCurveWithMarketCap>, marketSupply: number) {
  return {
    quoteReserve: new BN(0),
    baseReserve: tokenAmount(marketSupply),
    sqrtPrice: curveConfig.sqrtStartPrice,
    volatilityTracker: {
      lastUpdateTimestamp: new BN(0),
      padding: [],
      sqrtPriceReference: curveConfig.sqrtStartPrice,
      volatilityAccumulator: new BN(0),
      volatilityReference: new BN(0),
    },
    activationPoint: new BN(0),
    baseMint: PublicKey.default,
    quoteVault: PublicKey.default,
    baseVault: PublicKey.default,
  } as VirtualPool;
}

export function simulateMeteoraDbcLaunch(input: MeteoraDbcLaunchSimulationInput = {}): MeteoraDbcLaunchSimulation {
  const { launchConfig, treasurySupply, curveConfig } = buildMeteoraDbcCurveConfig(input);
  const marketSupply = launchConfig.totalSupply - treasurySupply;
  const configForQuote = {
    ...curveConfig,
    migrationSqrtPrice: migrationSqrtPrice(curveConfig),
  } as PoolConfig;
  const virtualPool = initialVirtualPool(curveConfig, marketSupply);
  const startingSpotPriceUsdc = spotPrice(virtualPool);
  const buyAmountsUsdc = input.buyAmountsUsdc?.length ? input.buyAmountsUsdc : DEFAULT_DBC_BUY_AMOUNTS_USDC;
  const quotes = buyAmountsUsdc.map((buyAmountUsdc) => {
    const quote = swapQuote(virtualPool, configForQuote, false, tokenAmount(buyAmountUsdc), 100, false, new BN(0), false);
    const result = quote as { outputAmount?: BN; nextSqrtPrice?: BN };
    const tokensOut = amountFromBaseUnits(result.outputAmount || new BN(0));
    const endingSpotPriceUsdc = Number(getPriceFromSqrtPrice(result.nextSqrtPrice || curveConfig.sqrtStartPrice, TokenDecimal.SIX, TokenDecimal.SIX).toString());

    return {
      buyAmountUsdc,
      tokensOut,
      totalSupplyPercent: launchConfig.totalSupply > 0 ? (tokensOut / launchConfig.totalSupply) * 100 : 0,
      marketSupplyPercent: marketSupply > 0 ? (tokensOut / marketSupply) * 100 : 0,
      averagePriceUsdc: tokensOut > 0 ? buyAmountUsdc / tokensOut : 0,
      startingSpotPriceUsdc,
      endingSpotPriceUsdc,
      priceImpactPercent: priceImpact({ side: "buy", inputAmount: buyAmountUsdc, estimatedOutput: tokensOut, currentPrice: startingSpotPriceUsdc }),
      poolProgressPercent: Math.max(0, Math.min((buyAmountUsdc / amountFromBaseUnits(curveConfig.migrationQuoteThreshold)) * 100, 100)),
    } satisfies MeteoraDbcLaunchSimulationQuote;
  });
  const failures = [
    ...quotes
      .filter((quote) => quote.buyAmountUsdc === 10 && quote.totalSupplyPercent > DBC_GUARDRAILS.maxTenUsdcTotalSupplyPercent)
      .map((quote) => `10 USDC buys ${quote.totalSupplyPercent.toFixed(2)}% of total supply.`),
    ...quotes
      .filter((quote) => quote.buyAmountUsdc === 100 && quote.totalSupplyPercent > DBC_GUARDRAILS.maxHundredUsdcTotalSupplyPercent)
      .map((quote) => `100 USDC buys ${quote.totalSupplyPercent.toFixed(2)}% of total supply.`),
  ];

  return {
    config: launchConfig,
    marketSupply,
    treasurySupply,
    migrationQuoteThresholdUsdc: amountFromBaseUnits(curveConfig.migrationQuoteThreshold),
    virtualDepthUsd: marketSupply * startingSpotPriceUsdc,
    quotes,
    guardrails: {
      passed: failures.length === 0,
      failures,
    },
  };
}

export function requireProgramConfig(env: NodeJS.ProcessEnv): SolanaProgramConfig {
  const rpcUrl = env.SOLANA_RPC_URL;
  const registryProgramId = env.SINGULARITY_REGISTRY_PROGRAM_ID || DEFAULT_REGISTRY_PROGRAM_ID;
  const councilProgramId = env.SINGULARITY_COUNCIL_PROGRAM_ID || DEFAULT_COUNCIL_PROGRAM_ID;

  if (!rpcUrl) throw new Error("SOLANA_RPC_URL is required for Solana transaction preparation.");

  return { rpcUrl, registryProgramId, councilProgramId };
}

export function connectionFor(config: SolanaProgramConfig) {
  return new Connection(config.rpcUrl, "confirmed");
}

export async function latestBlockhash(config: SolanaProgramConfig) {
  const connection = connectionFor(config);
  return connection.getLatestBlockhash();
}

export function buildPreparedTransaction(input: TransactionBuildInput): PreparedSolanaTransaction {
  const feePayer = new PublicKey(input.feePayer);
  const message = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: input.recentBlockhash,
    instructions: input.instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  if (input.signerKeypairs?.length) {
    transaction.sign(input.signerKeypairs);
  }

  return {
    kind: input.kind,
    status: "ready",
    network: "mainnet-beta",
    feePayer: feePayer.toBase58(),
    blockhash: input.recentBlockhash,
    transactionBase64: Buffer.from(transaction.serialize()).toString("base64"),
    accounts: input.accounts,
    instructions: input.instructions.map((instruction) => ({
      programId: instruction.programId.toBase58(),
      accounts: instruction.keys.map((key) => key.pubkey.toBase58()),
      dataBase64: Buffer.from(instruction.data).toString("base64"),
    })),
    requiredSigners: input.requiredSigners || [feePayer.toBase58()],
  };
}

export function buildPreparedTransactionSteps(input: {
  feePayer: string;
  recentBlockhash: string;
  kind: string;
  steps: TransactionBuildStep[];
  accounts?: Record<string, string>;
}): PreparedSolanaTransaction {
  if (input.steps.length === 0) throw new Error("At least one transaction step is required.");

  const feePayer = new PublicKey(input.feePayer);
  const steps = input.steps.map((step) => {
    const message = new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: input.recentBlockhash,
      instructions: step.instructions,
    }).compileToV0Message();
    const transaction = new VersionedTransaction(message);
    if (step.signerKeypairs?.length) transaction.sign(step.signerKeypairs);

    return {
      label: step.label,
      transactionBase64: Buffer.from(transaction.serialize()).toString("base64"),
      requiredSigners: step.requiredSigners || [feePayer.toBase58()],
    };
  });

  return {
    kind: input.kind,
    status: "ready",
    network: "mainnet-beta",
    feePayer: feePayer.toBase58(),
    blockhash: input.recentBlockhash,
    transactionBase64: steps[0].transactionBase64,
    transactions: steps,
    accounts: input.accounts,
    instructions: input.steps.flatMap((step) =>
      step.instructions.map((instruction) => ({
        programId: instruction.programId.toBase58(),
        accounts: instruction.keys.map((key) => key.pubkey.toBase58()),
        dataBase64: Buffer.from(instruction.data).toString("base64"),
      })),
    ),
    requiredSigners: Array.from(new Set(input.steps.flatMap((step) => step.requiredSigners || [feePayer.toBase58()]))),
  };
}

export async function prepareMeteoraDbcLaunchInstructions(input: MeteoraDbcLaunchInput) {
  const connection = new Connection(input.rpcUrl, "confirmed");
  const client = new DynamicBondingCurveClient(connection, "confirmed");
  const payer = new PublicKey(input.payer);
  const poolCreator = new PublicKey(input.poolCreator || input.payer);
  const quoteMint = new PublicKey(input.quoteMint);
  const feeClaimer = new PublicKey(input.feeClaimer);
  const leftoverReceiver = new PublicKey(input.leftoverReceiver);
  const config = Keypair.generate();
  const baseMint = Keypair.generate();
  const { launchConfig, treasurySupply, curveConfig } = buildMeteoraDbcCurveConfig({
    totalSupply: input.totalSupply,
    treasurySupplyPercent: input.treasurySupplyPercent,
    initialPurchaseUsdc: input.initialPurchaseUsdc,
    initialMarketCap: input.initialMarketCap,
    migrationMarketCap: input.migrationMarketCap,
  });
  const poolSupply = launchConfig.totalSupply - treasurySupply;
  const preCreatePoolParam = {
    name: input.name,
    symbol: input.symbol,
    uri: input.uri,
    poolCreator,
    baseMint: baseMint.publicKey,
  };
  const firstBuyQuoteAmount = launchConfig.initialPurchaseUsdc;
  const firstBuyParam =
    firstBuyQuoteAmount > 0
      ? {
          buyer: payer,
          receiver: payer,
          buyAmount: new BN(Math.floor(firstBuyQuoteAmount * 1_000_000)),
          minimumAmountOut: new BN(0),
          referralTokenAccount: null,
        }
      : undefined;
  const result = firstBuyParam
    ? await client.pool.createConfigAndPoolWithFirstBuy({
        config: config.publicKey,
        feeClaimer,
        leftoverReceiver,
        quoteMint,
        payer,
        ...curveConfig,
        preCreatePoolParam,
        firstBuyParam,
      })
    : await client.pool.createConfigAndPool({
        config: config.publicKey,
        feeClaimer,
        leftoverReceiver,
        quoteMint,
        payer,
        ...curveConfig,
        preCreatePoolParam,
      });
  const transactions = "createConfigTx" in result ? [result.createConfigTx, result.createPoolWithFirstBuyTx] : [result];
  const dbcPool = deriveDbcPoolAddress(quoteMint, baseMint.publicKey, config.publicKey);
  const treasuryVault = getAssociatedTokenAddressSync(baseMint.publicKey, leftoverReceiver, true, TOKEN_2022_PROGRAM_ID);
  const signerKeypairs = [config, baseMint];
  const transactionSteps = transactions.map((transaction, index) => ({
    label: index === 0 ? "Create Meteora DBC config" : "Create Meteora DBC pool",
    instructions: transaction.instructions,
    signerKeypairs: signerKeypairs.filter((signer) =>
      transaction.instructions.some((instruction) => instruction.keys.some((key) => key.isSigner && key.pubkey.equals(signer.publicKey))),
    ),
  }));

  return {
    instructions: transactions.flatMap((transaction) => transaction.instructions),
    transactionSteps,
    signerKeypairs,
    accounts: {
      meteoraConfig: config.publicKey.toBase58(),
      tokenMint: baseMint.publicKey.toBase58(),
      dbcPool: dbcPool.toBase58(),
      quoteMint: quoteMint.toBase58(),
      treasuryVault: treasuryVault.toBase58(),
      poolSupply: String(poolSupply),
      treasurySupply: String(treasurySupply),
      initialMarketCap: String(launchConfig.initialMarketCap),
      migrationMarketCap: String(launchConfig.migrationMarketCap),
    },
  };
}

function tokenAmount(value: number, decimals = 6) {
  return new BN(Math.floor(Math.max(Number(value) || 0, 0) * 10 ** decimals));
}

function amountFromBaseUnits(value: BN, decimals = 6) {
  return value.toNumber() / 10 ** decimals;
}

function bnField(value: unknown) {
  if (BN.isBN(value)) return value;
  if (typeof value === "number") return new BN(value);
  if (typeof value === "bigint") return new BN(value.toString());
  if (typeof value === "string") return new BN(value);
  return new BN(0);
}

function spotPrice(virtualPool: VirtualPool) {
  const price = getPriceFromSqrtPrice(bnField((virtualPool as { sqrtPrice?: unknown }).sqrtPrice), TokenDecimal.SIX, TokenDecimal.SIX);
  return Number(price.toString());
}

function reserveAmount(value: unknown) {
  return amountFromBaseUnits(bnField(value));
}

function priceImpact(input: { side: MeteoraDbcTradeSide; inputAmount: number; estimatedOutput: number; currentPrice: number }) {
  const spotOutput = input.side === "buy" ? input.inputAmount / input.currentPrice : input.inputAmount * input.currentPrice;
  if (!Number.isFinite(spotOutput) || spotOutput <= 0) return 0;
  return Math.max(((spotOutput - input.estimatedOutput) / spotOutput) * 100, 0);
}

async function dbcPoolState(input: { rpcUrl: string; pool: string }) {
  const connection = new Connection(input.rpcUrl, "confirmed");
  const client = new DynamicBondingCurveClient(connection, "confirmed");
  const virtualPool = await client.state.getPool(input.pool);
  const config = await client.state.getPoolConfig((virtualPool as { config: PublicKey }).config);
  const currentPoint = await getCurrentPoint(connection, (config as { activationType?: ActivationType }).activationType ?? ActivationType.Slot);

  return { connection, client, virtualPool, config, currentPoint };
}

function dbcQuoteFromResult(input: {
  pool: string;
  side: MeteoraDbcTradeSide;
  amount: number;
  virtualPool: VirtualPool;
  config: PoolConfig;
  quote: SwapQuoteResult;
}) {
  const currentPrice = spotPrice(input.virtualPool);
  const baseMint = (input.virtualPool as { baseMint: PublicKey }).baseMint.toBase58();
  const quoteMint = (input.config as { quoteMint: PublicKey }).quoteMint.toBase58();
  const quote = input.quote as { outputAmount?: BN; minimumAmountOut?: BN };
  const estimatedOutput = amountFromBaseUnits(quote.outputAmount || new BN(0));
  const minimumAmountOut = amountFromBaseUnits(quote.minimumAmountOut || new BN(0));
  const baseReserve = reserveAmount((input.virtualPool as { baseReserve?: unknown }).baseReserve);
  const quoteReserve = reserveAmount((input.virtualPool as { quoteReserve?: unknown }).quoteReserve);

  return {
    route: "meteora-dbc" as const,
    side: input.side,
    inputAmount: input.amount,
    estimatedOutput,
    minimumAmountOut,
    priceImpactPercent: priceImpact({ side: input.side, inputAmount: input.amount, estimatedOutput, currentPrice }),
    currentPrice,
    inputMint: input.side === "buy" ? quoteMint : baseMint,
    outputMint: input.side === "buy" ? baseMint : quoteMint,
    baseMint,
    quoteMint,
    dbcPool: input.pool,
    baseReserve,
    quoteReserve,
    liquidityUsd: quoteReserve + baseReserve * currentPrice,
    poolProgressPercent: 0,
    baseDecimals: 6,
    quoteDecimals: 6,
  };
}

export async function quoteMeteoraDbcTrade(input: {
  rpcUrl: string;
  pool: string;
  side: MeteoraDbcTradeSide;
  amount: number;
  slippageBps?: number;
}) {
  if (input.amount <= 0) throw new Error("amount must be greater than zero.");
  const { client, virtualPool, config, currentPoint } = await dbcPoolState(input);
  const quote = client.pool.swapQuote({
    virtualPool,
    config,
    swapBaseForQuote: input.side === "sell",
    amountIn: tokenAmount(input.amount),
    slippageBps: input.slippageBps ?? 100,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
  });
  const result = dbcQuoteFromResult({ pool: input.pool, side: input.side, amount: input.amount, virtualPool, config, quote });
  const progress = await client.state.getPoolQuoteTokenCurveProgress(input.pool).catch(() => 0);

  return { ...result, poolProgressPercent: Math.max(0, Math.min(progress * 100, 100)) };
}

export async function prepareMeteoraDbcTrade(input: {
  rpcUrl: string;
  pool: string;
  wallet: string;
  side: MeteoraDbcTradeSide;
  amount: number;
  recentBlockhash: string;
  slippageBps?: number;
}): Promise<MeteoraDbcTradeResult> {
  const quote = await quoteMeteoraDbcTrade(input);
  const owner = new PublicKey(input.wallet);
  const connection = new Connection(input.rpcUrl, "confirmed");
  const client = new DynamicBondingCurveClient(connection, "confirmed");
  const transaction = await client.pool.swap({
    owner,
    payer: owner,
    pool: new PublicKey(input.pool),
    amountIn: tokenAmount(input.amount),
    minimumAmountOut: tokenAmount(quote.minimumAmountOut),
    swapBaseForQuote: input.side === "sell",
    referralTokenAccount: null,
  });

  return {
    ...quote,
    transaction: buildPreparedTransaction({
      kind: "trade",
      feePayer: input.wallet,
      recentBlockhash: input.recentBlockhash,
      instructions: transaction.instructions,
      requiredSigners: [input.wallet],
      accounts: {
        dbcPool: input.pool,
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
      },
    }),
  };
}

export async function fetchMeteoraDbcMarketSnapshot(input: {
  rpcUrl: string;
  pool: string;
  tokenMint?: string | null;
  treasuryVault?: string | null;
  totalSupply?: number;
}) {
  const { connection, client, virtualPool, config } = await dbcPoolState(input);
  const currentPrice = spotPrice(virtualPool);
  const baseMint = input.tokenMint || (virtualPool as { baseMint: PublicKey }).baseMint.toBase58();
  const quoteMint = (config as { quoteMint: PublicKey }).quoteMint.toBase58();
  const baseReserve = reserveAmount((virtualPool as { baseReserve?: unknown }).baseReserve);
  const quoteReserve = reserveAmount((virtualPool as { quoteReserve?: unknown }).quoteReserve);
  const supply = input.totalSupply ?? (await connection.getTokenSupply(new PublicKey(baseMint)).then((result) => Number(result.value.uiAmount || 0)).catch(() => 0));
  const treasuryTokens = input.treasuryVault
    ? await connection.getTokenAccountBalance(new PublicKey(input.treasuryVault)).then((result) => Number(result.value.uiAmount || 0)).catch(() => 0)
    : 0;
  const holders = await connection
    .getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      filters: [{ memcmp: { offset: 0, bytes: baseMint } }],
      dataSlice: { offset: 64, length: 8 },
    })
    .then((accounts) => accounts.filter((account) => account.account.data.length >= 8 && account.account.data.readBigUInt64LE(0) > 0n).length)
    .catch(() => 0);
  const progress = await client.state.getPoolQuoteTokenCurveProgress(input.pool).catch(() => 0);
  const marketTokens = baseReserve;

  return {
    route: "meteora-dbc" as const,
    dbcPool: input.pool,
    baseMint,
    quoteMint,
    currentPrice,
    baseReserve,
    quoteReserve,
    liquidityUsd: quoteReserve + baseReserve * currentPrice,
    poolProgressPercent: Math.max(0, Math.min(progress * 100, 100)),
    treasuryTokens,
    treasuryUsdc: treasuryTokens * currentPrice,
    holders,
    totalSupply: supply,
    circulatingTokens: Math.max(supply - treasuryTokens - marketTokens, 0),
    marketTokens,
    updatedAt: new Date().toISOString(),
  } satisfies MeteoraDbcMarketSnapshot;
}

export function registryInstruction(input: {
  programId: string;
  opcode: number;
  payer: string;
  mission: string;
  metadataHash: string;
}) {
  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys: [
      { pubkey: new PublicKey(input.payer), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(input.mission), isSigner: false, isWritable: true },
    ],
    data: instructionData(input.opcode, input.metadataHash),
  });
}

export function councilInstruction(input: {
  programId: string;
  opcode: number;
  payer: string;
  mission: string;
  request?: string;
  metadataHash?: string;
  extraAccounts?: Array<{
    pubkey: string;
    isSigner?: boolean;
    isWritable?: boolean;
  }>;
}) {
  const keys = [
    { pubkey: new PublicKey(input.payer), isSigner: true, isWritable: true },
    { pubkey: new PublicKey(input.mission), isSigner: false, isWritable: true },
  ];

  if (input.request) {
    keys.push({ pubkey: new PublicKey(input.request), isSigner: false, isWritable: true });
  }

  for (const account of input.extraAccounts || []) {
    keys.push({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner ?? false,
      isWritable: account.isWritable ?? false,
    });
  }

  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys,
    data: instructionData(input.opcode, input.metadataHash || ""),
  });
}

export function createMissionMintInstructions(input: {
  payer: string;
  mint: string;
  mintAuthority: string;
  freezeAuthority?: string;
  rentLamports: number;
  decimals?: number;
}) {
  const mint = new PublicKey(input.mint);
  const payer = new PublicKey(input.payer);

  return [
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint,
      lamports: input.rentLamports,
      space: 82,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mint,
      input.decimals ?? 6,
      new PublicKey(input.mintAuthority),
      input.freezeAuthority ? new PublicKey(input.freezeAuthority) : null,
      TOKEN_2022_PROGRAM_ID,
    ),
  ];
}

function instructionData(opcode: number, metadataHash: string) {
  const hashBytes = Buffer.from(metadataHash.slice(0, 64).padEnd(64, "0"), "hex");
  return Buffer.concat([Buffer.from([opcode]), hashBytes]);
}
