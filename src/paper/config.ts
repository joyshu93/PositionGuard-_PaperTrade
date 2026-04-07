export interface PaperTradingSettingEnv {
  PAPER_INITIAL_CASH_KRW?: string;
  PAPER_FEE_RATE?: string;
  PAPER_SLIPPAGE_RATE?: string;
  PAPER_MIN_TRADE_VALUE_KRW?: string;
  PAPER_ENTRY_ALLOCATION?: string;
  PAPER_ADD_ALLOCATION?: string;
  PAPER_REDUCE_FRACTION?: string;
  PAPER_PER_ASSET_MAX_ALLOCATION?: string;
  PAPER_TOTAL_PORTFOLIO_MAX_EXPOSURE?: string;
}

export interface PaperTradingSettings {
  initialPaperCashKrw: number;
  feeRate: number;
  slippageRate: number;
  minimumTradeValueKrw: number;
  entryAllocation: number;
  addAllocation: number;
  reduceFraction: number;
  perAssetMaxAllocation: number;
  totalPortfolioMaxExposure: number;
}

export type PaperTradingSettingKey = keyof PaperTradingSettings;
export type PaperTradingSettingSource = "default" | "env";

export interface ResolvedPaperTradingSettings {
  values: PaperTradingSettings;
  scope: "global";
  sourceByField: Record<PaperTradingSettingKey, PaperTradingSettingSource>;
}

export const DEFAULT_PAPER_TRADING_SETTINGS: PaperTradingSettings = {
  initialPaperCashKrw: 1_000_000,
  feeRate: 0.0005,
  slippageRate: 0.0003,
  minimumTradeValueKrw: 5_000,
  entryAllocation: 0.25,
  addAllocation: 0.15,
  reduceFraction: 0.33,
  perAssetMaxAllocation: 0.45,
  totalPortfolioMaxExposure: 0.75,
};

export function resolvePaperTradingSettings(
  env?: Partial<PaperTradingSettingEnv>,
): ResolvedPaperTradingSettings {
  const values: PaperTradingSettings = {
    initialPaperCashKrw: resolveNumericSetting(
      env?.PAPER_INITIAL_CASH_KRW,
      DEFAULT_PAPER_TRADING_SETTINGS.initialPaperCashKrw,
      { minExclusive: 0 },
    ),
    feeRate: resolveNumericSetting(
      env?.PAPER_FEE_RATE,
      DEFAULT_PAPER_TRADING_SETTINGS.feeRate,
      { minInclusive: 0, maxExclusive: 1 },
    ),
    slippageRate: resolveNumericSetting(
      env?.PAPER_SLIPPAGE_RATE,
      DEFAULT_PAPER_TRADING_SETTINGS.slippageRate,
      { minInclusive: 0, maxExclusive: 1 },
    ),
    minimumTradeValueKrw: resolveNumericSetting(
      env?.PAPER_MIN_TRADE_VALUE_KRW,
      DEFAULT_PAPER_TRADING_SETTINGS.minimumTradeValueKrw,
      { minExclusive: 0 },
    ),
    entryAllocation: resolveNumericSetting(
      env?.PAPER_ENTRY_ALLOCATION,
      DEFAULT_PAPER_TRADING_SETTINGS.entryAllocation,
      { minExclusive: 0, maxInclusive: 1 },
    ),
    addAllocation: resolveNumericSetting(
      env?.PAPER_ADD_ALLOCATION,
      DEFAULT_PAPER_TRADING_SETTINGS.addAllocation,
      { minExclusive: 0, maxInclusive: 1 },
    ),
    reduceFraction: resolveNumericSetting(
      env?.PAPER_REDUCE_FRACTION,
      DEFAULT_PAPER_TRADING_SETTINGS.reduceFraction,
      { minExclusive: 0, maxInclusive: 1 },
    ),
    perAssetMaxAllocation: resolveNumericSetting(
      env?.PAPER_PER_ASSET_MAX_ALLOCATION,
      DEFAULT_PAPER_TRADING_SETTINGS.perAssetMaxAllocation,
      { minExclusive: 0, maxInclusive: 1 },
    ),
    totalPortfolioMaxExposure: resolveNumericSetting(
      env?.PAPER_TOTAL_PORTFOLIO_MAX_EXPOSURE,
      DEFAULT_PAPER_TRADING_SETTINGS.totalPortfolioMaxExposure,
      { minExclusive: 0, maxInclusive: 1 },
    ),
  };

  return {
    values,
    scope: "global",
    sourceByField: {
      initialPaperCashKrw: values.initialPaperCashKrw === DEFAULT_PAPER_TRADING_SETTINGS.initialPaperCashKrw &&
        !hasText(env?.PAPER_INITIAL_CASH_KRW)
        ? "default"
        : hasValidNumber(env?.PAPER_INITIAL_CASH_KRW, { minExclusive: 0 })
          ? "env"
          : "default",
      feeRate:
        values.feeRate === DEFAULT_PAPER_TRADING_SETTINGS.feeRate && !hasText(env?.PAPER_FEE_RATE)
          ? "default"
          : hasValidNumber(env?.PAPER_FEE_RATE, { minInclusive: 0, maxExclusive: 1 })
            ? "env"
            : "default",
      slippageRate:
        values.slippageRate === DEFAULT_PAPER_TRADING_SETTINGS.slippageRate &&
        !hasText(env?.PAPER_SLIPPAGE_RATE)
          ? "default"
          : hasValidNumber(env?.PAPER_SLIPPAGE_RATE, { minInclusive: 0, maxExclusive: 1 })
            ? "env"
            : "default",
      minimumTradeValueKrw:
        values.minimumTradeValueKrw === DEFAULT_PAPER_TRADING_SETTINGS.minimumTradeValueKrw &&
        !hasText(env?.PAPER_MIN_TRADE_VALUE_KRW)
          ? "default"
          : hasValidNumber(env?.PAPER_MIN_TRADE_VALUE_KRW, { minExclusive: 0 })
            ? "env"
            : "default",
      entryAllocation:
        values.entryAllocation === DEFAULT_PAPER_TRADING_SETTINGS.entryAllocation &&
        !hasText(env?.PAPER_ENTRY_ALLOCATION)
          ? "default"
          : hasValidNumber(env?.PAPER_ENTRY_ALLOCATION, { minExclusive: 0, maxInclusive: 1 })
            ? "env"
            : "default",
      addAllocation:
        values.addAllocation === DEFAULT_PAPER_TRADING_SETTINGS.addAllocation &&
        !hasText(env?.PAPER_ADD_ALLOCATION)
          ? "default"
          : hasValidNumber(env?.PAPER_ADD_ALLOCATION, { minExclusive: 0, maxInclusive: 1 })
            ? "env"
            : "default",
      reduceFraction:
        values.reduceFraction === DEFAULT_PAPER_TRADING_SETTINGS.reduceFraction &&
        !hasText(env?.PAPER_REDUCE_FRACTION)
          ? "default"
          : hasValidNumber(env?.PAPER_REDUCE_FRACTION, { minExclusive: 0, maxInclusive: 1 })
            ? "env"
            : "default",
      perAssetMaxAllocation:
        values.perAssetMaxAllocation === DEFAULT_PAPER_TRADING_SETTINGS.perAssetMaxAllocation &&
        !hasText(env?.PAPER_PER_ASSET_MAX_ALLOCATION)
          ? "default"
          : hasValidNumber(env?.PAPER_PER_ASSET_MAX_ALLOCATION, { minExclusive: 0, maxInclusive: 1 })
            ? "env"
            : "default",
      totalPortfolioMaxExposure:
        values.totalPortfolioMaxExposure === DEFAULT_PAPER_TRADING_SETTINGS.totalPortfolioMaxExposure &&
        !hasText(env?.PAPER_TOTAL_PORTFOLIO_MAX_EXPOSURE)
          ? "default"
          : hasValidNumber(env?.PAPER_TOTAL_PORTFOLIO_MAX_EXPOSURE, { minExclusive: 0, maxInclusive: 1 })
            ? "env"
            : "default",
    },
  };
}

function resolveNumericSetting(
  raw: string | undefined,
  fallback: number,
  constraints: {
    minInclusive?: number;
    minExclusive?: number;
    maxInclusive?: number;
    maxExclusive?: number;
  },
): number {
  if (!hasValidNumber(raw, constraints)) {
    return fallback;
  }

  return Number(raw!.trim());
}

function hasValidNumber(
  raw: string | undefined,
  constraints: {
    minInclusive?: number;
    minExclusive?: number;
    maxInclusive?: number;
    maxExclusive?: number;
  },
): boolean {
  if (!hasText(raw)) {
    return false;
  }

  const value = Number(raw!.trim());
  if (!Number.isFinite(value)) {
    return false;
  }

  if (constraints.minInclusive !== undefined && value < constraints.minInclusive) {
    return false;
  }

  if (constraints.minExclusive !== undefined && value <= constraints.minExclusive) {
    return false;
  }

  if (constraints.maxInclusive !== undefined && value > constraints.maxInclusive) {
    return false;
  }

  if (constraints.maxExclusive !== undefined && value >= constraints.maxExclusive) {
    return false;
  }

  return true;
}

function hasText(raw: string | undefined): boolean {
  return typeof raw === "string" && raw.trim().length > 0;
}
