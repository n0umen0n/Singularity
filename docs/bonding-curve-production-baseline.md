# Bonding Curve Production Baseline

This file records the normal production DBC defaults before the temporary
low-graduation production test branch.

## Normal Production Defaults

```ts
export const DEFAULT_DBC_TOTAL_SUPPLY = 50_000_000;
export const DEFAULT_DBC_TREASURY_SUPPLY_PERCENT = 20;
export const DEFAULT_DBC_INITIAL_MARKET_CAP = 50_000;
export const DEFAULT_DBC_MIGRATION_MARKET_CAP = 130_901.7;
```

## Temporary Low-Graduation Test Branch

Branch: `prod-low-bonding-curve-graduation-test`

```ts
export const DEFAULT_DBC_TOTAL_SUPPLY = 50_000_000;
export const DEFAULT_DBC_TREASURY_SUPPLY_PERCENT = 20;
export const DEFAULT_DBC_INITIAL_MARKET_CAP = 14;
export const DEFAULT_DBC_MIGRATION_MARKET_CAP = 28;
```

The low values keep the required migration quote threshold under roughly 10
USDC so a small production buy can graduate a newly created mission market and
exercise the trading-fee claim flow.
