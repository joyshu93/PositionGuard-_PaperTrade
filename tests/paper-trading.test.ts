import { assert, assertEqual } from "./test-helpers.js";
import type { PaperTradingContext } from "../src/domain/types.js";
import type { PositionStructureAnalysis, TimeframeStructure } from "../src/decision/market-structure.js";
import {
  applyPaperFill,
  buildEquitySnapshot,
  calculateBuyFill,
  calculateBuyQuantity,
  calculateSellFill,
  calculateSellQuantity,
} from "../src/paper/math.js";
import {
  buildHourlySummaryMessage,
  renderPaperDecisionMessage,
  renderPaperPnlMessage,
  renderPaperSettingsMessage,
  renderPaperStatusMessage,
} from "../src/paper/reporting.js";
import { buildPaperTradeDecisionFromAnalysis } from "../src/paper/strategy.js";
import { runUserHourlyCycle } from "../src/hourly.js";

const account = {
  id: 1,
  userId: 1,
  currency: "KRW" as const,
  initialCash: 1_000_000,
  cashBalance: 1_000_000,
  realizedPnl: 0,
  totalFeesPaid: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const settings = {
  initialPaperCashKrw: 2_000_000,
  feeRate: 0.001,
  slippageRate: 0.0007,
  minimumTradeValueKrw: 15_000,
  entryAllocation: 0.3,
  addAllocation: 0.2,
  reduceFraction: 0.4,
  perAssetMaxAllocation: 0.45,
  totalPortfolioMaxExposure: 0.75,
} as const;

const buyQuantity = calculateBuyQuantity(250_000, account.cashBalance, 100_000);
assert(buyQuantity > 0, "Buy quantity should be positive for a valid staged allocation.");

const buyFill = calculateBuyFill("ENTRY", buyQuantity, 100_000);
assert(buyFill !== null, "Buy fill should be created when staged value clears the minimum threshold.");

const afterBuy = applyPaperFill({
  account,
  position: null,
  asset: "BTC",
  market: "KRW-BTC",
  fill: buyFill!,
});

assert(afterBuy.account.cashBalance >= 0, "Paper cash balance must never go negative.");
assert(afterBuy.position !== null && afterBuy.position.quantity > 0, "Paper entry should create a positive position.");

const sellQuantity = calculateSellQuantity(afterBuy.position!.quantity, 1);
const sellFillWin = calculateSellFill("EXIT", sellQuantity, 110_000, afterBuy.position!.averageEntryPrice);
assert(sellFillWin !== null, "Winning sell fill should be created for a valid exit quantity.");

const afterSell = applyPaperFill({
  account: afterBuy.account,
  position: afterBuy.position,
  asset: "BTC",
  market: "KRW-BTC",
  fill: sellFillWin!,
});

assertEqual(afterSell.position.quantity, 0, "Full exit should flatten the paper position.");
assert(afterSell.account.cashBalance >= 0, "Paper cash balance should remain non-negative after exit.");

const equity = buildEquitySnapshot({
  userId: 1,
  account: afterSell.account,
  asset: null,
  positions: {
    BTC: afterSell.position,
    ETH: null,
  },
  latestPrices: {
    BTC: 110_000,
    ETH: null,
  },
});

assert(equity.totalEquity >= 0, "Equity snapshot should keep total equity non-negative.");

const performanceSnapshot = {
  account: afterSell.account,
  positions: {
    BTC: afterSell.position,
    ETH: null,
  },
  latestPrices: {
    BTC: 110_000,
    ETH: null,
  },
  recentTrades: [
    {
      id: 3,
      userId: 1,
      accountId: 1,
      asset: "BTC" as const,
      market: "KRW-BTC" as const,
      side: "SELL" as const,
      action: "EXIT" as const,
      quantity: 1,
      fillPrice: 110_000,
      grossAmount: 110_000,
      feeAmount: 55,
      realizedPnl: 9_945,
      slippageRate: 0.0003,
      note: null,
      createdAt: "2026-01-01T02:00:00.000Z",
    },
  ],
  latestEquity: null,
  totalEquity: equity.totalEquity,
  unrealizedPnl: equity.unrealizedPnl,
  cumulativeReturnPct: equity.totalReturnPct,
  cumulativeClosedTradeCount: 3,
  cumulativeWinningTradeCount: 2,
  cumulativeWinRate: 2 / 3,
  cumulativeRealizedPnlFromTrades: 7_500,
};

assert(
  renderPaperStatusMessage(performanceSnapshot, "en").includes("All fills are internal simulated paper fills."),
  "Paper status should explicitly say fills are simulated.",
);
assert(
  renderPaperPnlMessage(performanceSnapshot, "en").includes("Total closed trades: 3"),
  "/pnl should show cumulative closed-trade count.",
);

const hourlySummary = buildHourlySummaryMessage({
  btcAction: "ENTRY",
  ethAction: "HOLD",
  snapshot: performanceSnapshot,
  locale: "en",
});
assert(
  hourlySummary.includes("BTC: Entry | ETH: Hold") &&
    hourlySummary.includes("All values reflect internal simulated paper fills"),
  "Hourly summary should include localized actions and simulated-fill wording.",
);

const settingsMessage = renderPaperSettingsMessage(
  {
    values: settings,
    scope: "global",
    sourceByField: {
      initialPaperCashKrw: "env",
      feeRate: "env",
      slippageRate: "default",
      minimumTradeValueKrw: "default",
      entryAllocation: "env",
      addAllocation: "default",
      reduceFraction: "env",
      perAssetMaxAllocation: "default",
      totalPortfolioMaxExposure: "env",
    },
  },
  "en",
);
assert(
  settingsMessage.includes("Per-asset max allocation: +45% (default)") &&
    settingsMessage.includes("Total portfolio max exposure: +75% (env override)"),
  "/settings should expose exposure guardrails as active settings.",
);

const hysteresisEntryHold = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 0 }),
  createAnalysis({
    regime: "EARLY_RECOVERY",
    pullbackZone: true,
    volumeRecovery: false,
    macdImproving: false,
    reclaimStructure: false,
    breakoutHoldStructure: false,
  }),
);
assertEqual(
  hysteresisEntryHold.action,
  "HOLD",
  "Hysteresis should keep a flat asset on HOLD when bullish evidence remains below the entry threshold.",
);

const deferredBorderlineEntry = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 0 }),
  createAnalysis({
    regime: "PULLBACK_IN_UPTREND",
    pullbackZone: true,
    volumeRecovery: true,
    macdImproving: false,
    reclaimStructure: false,
    breakoutHoldStructure: false,
  }),
);
assert(
  deferredBorderlineEntry.action === "ENTRY" &&
    deferredBorderlineEntry.executionDisposition === "DEFERRED_CONFIRMATION",
  "Borderline bullish setups should defer ENTRY pending one more hourly confirmation.",
);

const confirmedBorderlineEntry = buildPaperTradeDecisionFromAnalysis(
  createContext({
    positionQuantity: 0,
    latestDecision: {
      id: 10,
      userId: 1,
      asset: "BTC",
      market: "KRW-BTC",
      action: "ENTRY",
      executionStatus: "SKIPPED",
      summary: "Deferred",
      reasons: [],
      rationale: {
        executionDisposition: "DEFERRED_CONFIRMATION",
        signalQuality: { bucket: "BORDERLINE" },
      },
      referencePrice: 100_000,
      fillPrice: null,
      tradeId: null,
      createdAt: "2026-04-06T00:00:00.000Z",
    },
  }),
  createAnalysis({
    regime: "PULLBACK_IN_UPTREND",
    pullbackZone: true,
    volumeRecovery: true,
  }),
);
assertEqual(
  confirmedBorderlineEntry.executionDisposition,
  "EXECUTED_AFTER_CONFIRMATION",
  "A repeated borderline bullish setup should execute after one additional hourly confirmation.",
);

const strongImmediateEntry = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 0 }),
  createAnalysis({
    regime: "BULL_TREND",
    pullbackZone: true,
    reclaimStructure: true,
    breakoutHoldStructure: true,
    volumeRecovery: true,
    macdImproving: true,
  }),
);
assert(
  strongImmediateEntry.action === "ENTRY" &&
    strongImmediateEntry.executionDisposition === "IMMEDIATE",
  "Strong bullish setups should execute immediately without waiting for confirmation.",
);

const immediateInvalidationExit = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 1 }),
  createAnalysis({
    invalidationState: "BROKEN",
    regime: "BREAKDOWN_RISK",
    breakdown1d: true,
  }),
);
assert(
  immediateInvalidationExit.action === "EXIT" &&
    immediateInvalidationExit.executionDisposition === "IMMEDIATE",
  "Invalidation-based exits should remain immediate and unchanged.",
);

const mildWeaknessHold = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 1 }),
  createAnalysis({
    regime: "RANGE",
    riskLevel: "MODERATE",
    failedReclaim: false,
    bearishMomentumExpansion: false,
    atrShock: false,
  }),
);
assertEqual(
  mildWeaknessHold.action,
  "HOLD",
  "Healthy holds should not flip into REDUCE on weak evidence alone.",
);

const moderateReduce = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 1 }),
  createAnalysis({
    regime: "WEAK_DOWNTREND",
    riskLevel: "ELEVATED",
    failedReclaim: true,
    bearishMomentumExpansion: false,
  }),
);
const strongerReduce = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 1 }),
  createAnalysis({
    regime: "WEAK_DOWNTREND",
    riskLevel: "ELEVATED",
    failedReclaim: true,
    bearishMomentumExpansion: true,
  }),
);
assert(
  moderateReduce.action === "REDUCE" &&
    strongerReduce.action === "REDUCE" &&
    (moderateReduce.targetQuantityFraction ?? 0) < (strongerReduce.targetQuantityFraction ?? 0),
  "Reduce sizing should scale up as weakening becomes more clearly confirmed.",
);

const strongAdd = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 1 }),
  createAnalysis({
    regime: "BULL_TREND",
    pullbackZone: true,
    reclaimStructure: true,
    breakoutHoldStructure: true,
    volumeRecovery: true,
    macdImproving: true,
  }),
);
const borderlineAdd = buildPaperTradeDecisionFromAnalysis(
  createContext({
    positionQuantity: 1,
    latestDecision: {
      id: 12,
      userId: 1,
      asset: "BTC",
      market: "KRW-BTC",
      action: "ADD",
      executionStatus: "SKIPPED",
      summary: "Deferred",
      reasons: [],
      rationale: {
        executionDisposition: "DEFERRED_CONFIRMATION",
        signalQuality: { bucket: "BORDERLINE" },
      },
      referencePrice: 100_000,
      fillPrice: null,
      tradeId: null,
      createdAt: "2026-04-06T00:00:00.000Z",
    },
  }),
  createAnalysis({
    regime: "PULLBACK_IN_UPTREND",
    pullbackZone: true,
    volumeRecovery: false,
  }),
);
assert(
  strongAdd.action === "ADD" &&
    borderlineAdd.action === "ADD" &&
    strongAdd.targetCashToUse > borderlineAdd.targetCashToUse,
  "Bullish sizing should be more aggressive for stronger constructive structure than for confirmed borderline adds.",
);

const softReentryPenalty = buildPaperTradeDecisionFromAnalysis(
  createContext({
    positionQuantity: 0,
    recentExitHours: 6,
  }),
  createAnalysis({
    regime: "PULLBACK_IN_UPTREND",
    pullbackZone: true,
    volumeRecovery: false,
  }),
);
assertEqual(
  softReentryPenalty.action,
  "HOLD",
  "A recent exit should slightly raise the entry threshold as a soft re-entry caution.",
);

const strongReentryOvercomesPenalty = buildPaperTradeDecisionFromAnalysis(
  createContext({
    positionQuantity: 0,
    recentExitHours: 6,
  }),
  createAnalysis({
    regime: "BULL_TREND",
    pullbackZone: true,
    reclaimStructure: true,
    breakoutHoldStructure: true,
    volumeRecovery: true,
    macdImproving: true,
  }),
);
assert(
  strongReentryOvercomesPenalty.action === "ENTRY" &&
    strongReentryOvercomesPenalty.executionDisposition === "IMMEDIATE",
  "Strong reclaim/recovery structure should still overcome the soft re-entry penalty.",
);

const decisionMessage = renderPaperDecisionMessage(
  {
    latestByAsset: {
      BTC: {
        id: 1,
        userId: 1,
        asset: "BTC",
        market: "KRW-BTC",
        action: "ENTRY",
        executionStatus: "SKIPPED",
        summary: "BTC entry setup is deferred pending one additional hourly confirmation.",
        reasons: ["Bullish structure is valid but borderline."],
        rationale: {
          executionDisposition: "DEFERRED_CONFIRMATION",
          signalQuality: { bucket: "BORDERLINE" },
        },
        referencePrice: 150_000_000,
        fillPrice: null,
        tradeId: null,
        createdAt: "2026-04-06T01:00:00.000Z",
      },
      ETH: {
        id: 2,
        userId: 1,
        asset: "ETH",
        market: "KRW-ETH",
        action: "ADD",
        executionStatus: "EXECUTED",
        summary: "ETH paper add is allowed by constructive structure.",
        reasons: ["Constructive pullback quality is strong enough."],
        rationale: {
          executionDisposition: "IMMEDIATE",
          signalQuality: { bucket: "HIGH" },
        },
        referencePrice: 4_500_000,
        fillPrice: 4_501_000,
        tradeId: 9,
        createdAt: "2026-04-06T01:00:00.000Z",
      },
    },
  },
  "en",
);
assert(
  decisionMessage.includes("BTC: Entry | Deferred") &&
    decisionMessage.includes("Signal quality: Borderline") &&
    decisionMessage.includes("ETH: Add | Immediate"),
  "/decision should show deferred versus immediate execution status and the signal quality bucket.",
);

let aggregatePersistCalls = 0;
let sentMessages = 0;
await runUserHourlyCycle({
  db: {} as never,
  telegramClient: {
    async sendMessage() {
      sentMessages += 1;
    },
    async answerCallbackQuery() {
      return;
    },
  },
  userState: {
    user: {
      id: 1,
      telegramUserId: "1",
      telegramChatId: "100",
      username: null,
      displayName: null,
      locale: "en",
      trackedAssets: "BTC,ETH",
      sleepModeEnabled: false,
      onboardingComplete: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    accountState: null,
    positions: {},
  },
  upbitBaseUrl: null,
  paperTradingSettings: settings,
  ensureAccount: async () => ({ ...account, initialCash: settings.initialPaperCashKrw }),
  processAssetCycle: async (_db, _client, _userState, asset) => ({
    action: asset === "BTC" ? "ENTRY" : "HOLD",
    executed: asset === "BTC",
    executionDisposition: asset === "BTC" ? "IMMEDIATE" : "SKIPPED",
    summary: `${asset} summary`,
    reasons: [],
    trade: null,
    updatedAccount: { ...account, initialCash: settings.initialPaperCashKrw },
    updatedPosition: null,
    referencePrice: asset === "BTC" ? 100_000 : 3_000_000,
    fillPrice: null,
    latestMarketPrice: asset === "BTC" ? 100_000 : 3_000_000,
  }),
  persistAggregateSnapshot: async () => {
    aggregatePersistCalls += 1;
    return {
      id: 1,
      userId: 1,
      accountId: 1,
      asset: null,
      cashBalance: account.cashBalance,
      positionMarketValue: 0,
      totalEquity: account.cashBalance,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalReturnPct: 0,
      createdAt: "2026-01-01T01:00:00.000Z",
    };
  },
  loadPerformanceSnapshot: async () => performanceSnapshot,
});

assertEqual(
  aggregatePersistCalls,
  1,
  "Aggregate equity snapshot should be created once per user hourly run after both assets are processed.",
);
assertEqual(
  sentMessages,
  1,
  "A single hourly summary should be sent once per user hourly run when sleep mode is off.",
);

function createContext(input?: {
  positionQuantity?: number;
  latestDecision?: PaperTradingContext["latestDecision"];
  recentExitHours?: number | null;
}): PaperTradingContext {
  const quantity = input?.positionQuantity ?? 0;
  return {
    user: {
      id: 1,
      telegramUserId: "1",
      telegramChatId: "100",
      locale: "en",
      sleepModeEnabled: false,
    },
    asset: "BTC",
    market: "KRW-BTC",
    account: {
      ...account,
      cashBalance: 1_000_000,
    },
    position:
      quantity > 0
        ? {
            id: 1,
            userId: 1,
            asset: "BTC",
            market: "KRW-BTC",
            quantity,
            averageEntryPrice: 100_000,
            lastMarkPrice: 100_000,
            realizedPnl: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }
        : null,
    portfolio: {
      totalEquity: 1_200_000,
      assetMarketValue: quantity > 0 ? 100_000 : 0,
      totalExposureValue: quantity > 0 ? 100_000 : 0,
      assetExposureRatio: quantity > 0 ? 100_000 / 1_200_000 : 0,
      totalExposureRatio: quantity > 0 ? 100_000 / 1_200_000 : 0,
    },
    latestDecision: input?.latestDecision ?? null,
    recentExit: {
      tradeId: input?.recentExitHours != null ? 5 : null,
      createdAt: input?.recentExitHours != null ? "2026-04-05T20:00:00.000Z" : null,
      hoursSinceExit: input?.recentExitHours ?? null,
    },
    marketSnapshot: {
      market: "KRW-BTC",
      asset: "BTC",
      ticker: {
        market: "KRW-BTC",
        tradePrice: 100_000,
        changeRate: 0,
        fetchedAt: "2026-04-06T00:00:00.000Z",
      },
      timeframes: {
        "1h": { timeframe: "1h", candles: [] },
        "4h": { timeframe: "4h", candles: [] },
        "1d": { timeframe: "1d", candles: [] },
      },
    },
    generatedAt: "2026-04-06T00:00:00.000Z",
    settings,
  };
}

function createAnalysis(overrides?: Partial<PositionStructureAnalysis>): PositionStructureAnalysis {
  return {
    asset: "BTC",
    market: "KRW-BTC",
    currentPrice: 100_000,
    timeframes: {
      "1h": createTimeframeStructure("1h"),
      "4h": createTimeframeStructure("4h"),
      "1d": createTimeframeStructure("1d"),
    },
    bearishTrendCount: 0,
    bullishTrendCount: 2,
    lowerLocationCount: 1,
    upperLocationCount: 0,
    breakdown4h: false,
    breakdown1d: false,
    failedReclaim: false,
    regime: "PULLBACK_IN_UPTREND",
    regimeSummary: "Constructive pullback.",
    invalidationLevel: 95_000,
    invalidationState: "CLEAR",
    riskLevel: "LOW",
    upperRangeChase: false,
    pullbackZone: true,
    reclaimLevel: 99_000,
    reclaimStructure: false,
    breakoutHoldStructure: false,
    volumeRecovery: true,
    macdImproving: false,
    rsiRecovery: false,
    bearishMomentumExpansion: false,
    atrShock: false,
    averageEntryPrice: 100_000,
    pnlPct: 0,
    ...overrides,
  };
}

function createTimeframeStructure(timeframe: TimeframeStructure["timeframe"]): TimeframeStructure {
  return {
    timeframe,
    trend: "UP",
    rangeHigh: 105_000,
    rangeLow: 95_000,
    previousRangeLow: 96_000,
    previousRangeHigh: 104_000,
    location: "MIDDLE",
    changePct: 0.02,
    latestClose: 100_000,
    previousClose: 99_500,
    swingHigh: 105_000,
    swingLow: 95_000,
    support: 95_000,
    resistance: 105_000,
    indicators: {
      ema20: 99_000,
      ema50: 98_000,
      ema200: 96_000,
      atr14: 1_000,
      rsi14: 52,
      macdLine: 1,
      macdSignal: 0.5,
      macdHistogram: 0.5,
      previousMacdHistogram: 0.25,
      volumeRatio: 1,
    },
    aboveEma20: true,
    aboveEma50: true,
    aboveEma200: true,
    emaStackBullish: true,
    emaStackBearish: false,
    macdHistogramImproving: true,
    rsiOverbought: false,
    rsiOversold: false,
  };
}
