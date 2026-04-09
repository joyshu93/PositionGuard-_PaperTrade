import { assert, assertEqual } from "./test-helpers.js";
import type { MarketSnapshot, PaperTradingContext } from "../src/domain/types.js";
import {
  analyzeMarketStructure,
  type PositionStructureAnalysis,
  type TimeframeStructure,
} from "../src/decision/market-structure.js";
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
import { resolvePortfolioMarkPrices, runUserHourlyCycle } from "../src/hourly.js";

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
  settingsMessage.includes("Exchange-referenced assumptions") &&
    settingsMessage.includes("Minimum trade value: 15,000 KRW") &&
    settingsMessage.includes("internal paper-trading assumptions"),
  "/settings should distinguish exchange-referenced assumptions from internal simulation settings.",
);

const incompleteCandleAnalysis = analyzeMarketStructure(
  createMonotonicMarketSnapshot({
    tradePrice: 95,
    tradeTimeUtc: "2026-04-06T10:15:00",
    fetchedAt: "2026-04-06T10:15:00.000Z",
    oneHourCloses: [100, 101, 102, 103, 104, 90],
    oneHourVolumes: [100, 100, 100, 100, 100, 250],
    oneHourFinalCloseTime: "2026-04-06T11:00:00",
    fourHourCloses: [95, 96, 97, 98, 99, 100],
    oneDayCloses: [90, 91, 92, 93, 94, 95],
  }),
);
assertEqual(
  incompleteCandleAnalysis.timeframes["1h"].latestClose,
  104,
  "Structure analysis should ignore a still-forming latest candle and use the most recent completed close for signal inputs.",
);
assertEqual(
  incompleteCandleAnalysis.volumeRecovery,
  false,
  "An incomplete volume spike should not count as constructive recovery volume.",
);

const mutedRecoveryAnalysis = analyzeMarketStructure(
  createMonotonicMarketSnapshot({
    tradePrice: 103,
    tradeTimeUtc: "2026-04-06T10:00:00",
    fetchedAt: "2026-04-06T10:00:00.000Z",
    oneHourCloses: [100, 100.5, 101, 101.5, 102, 102.2, 102.4, 102.6, 102.8, 103, 103.1, 103.2, 103.3, 103.4, 103.5, 103.6, 103.7, 103.8, 103.9, 104, 104.1],
    oneHourVolumes: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 96],
    fourHourCloses: [95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 104.2, 104.4, 104.6, 104.8, 105, 105.1, 105.2, 105.3, 105.4, 105.5, 105.6],
    fourHourVolumes: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 99],
    oneDayCloses: [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
  }),
);
assertEqual(
  mutedRecoveryAnalysis.volumeRecovery,
  false,
  "Sub-baseline recovery volume should not be treated as constructive recovery anymore.",
);

const constructiveRecoveryAnalysis = analyzeMarketStructure(
  createMonotonicMarketSnapshot({
    tradePrice: 103,
    tradeTimeUtc: "2026-04-06T10:00:00",
    fetchedAt: "2026-04-06T10:00:00.000Z",
    oneHourCloses: [100, 100.5, 101, 101.5, 102, 102.2, 102.4, 102.6, 102.8, 103, 103.1, 103.2, 103.3, 103.4, 103.5, 103.6, 103.7, 103.8, 103.9, 104, 104.2],
    oneHourVolumes: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 112],
    fourHourCloses: [95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 104.2, 104.4, 104.6, 104.8, 105, 105.1, 105.2, 105.3, 105.4, 105.5, 105.6],
    oneDayCloses: [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
  }),
);
assertEqual(
  constructiveRecoveryAnalysis.volumeRecovery,
  true,
  "Recovery volume should still count when the latest completed candle actually expands above baseline.",
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
    trendAlignmentScore: 3,
  }),
);
assert(
  deferredBorderlineEntry.action === "ENTRY" &&
    deferredBorderlineEntry.executionDisposition === "DEFERRED_CONFIRMATION",
  "Borderline bullish setups should defer ENTRY pending one more hourly confirmation.",
);

const reclaimImmediateEntry = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 0 }),
  createAnalysis({
    regime: "RECLAIM_ATTEMPT",
    pullbackZone: false,
    reclaimStructure: true,
    breakoutHoldStructure: false,
    volumeRecovery: true,
    macdImproving: false,
    rsiRecovery: false,
    entryPath: "RECLAIM",
    trendAlignmentScore: 4,
    recoveryQualityScore: 3,
  }),
);
assert(
  reclaimImmediateEntry.action === "ENTRY" &&
    reclaimImmediateEntry.executionDisposition === "IMMEDIATE",
  "Reclaim entries should be able to act faster than comparable raw pullbacks once recovery quality is strong enough.",
);

const breakoutHoldDeferredEntry = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 0 }),
  createAnalysis({
    regime: "BULL_TREND",
    pullbackZone: false,
    reclaimStructure: false,
    breakoutHoldStructure: true,
    volumeRecovery: true,
    macdImproving: false,
    rsiRecovery: false,
    entryPath: "BREAKOUT_HOLD",
    trendAlignmentScore: 3,
    recoveryQualityScore: 2,
    timeframes: {
      "1h": createTimeframeStructure("1h", "UPPER"),
      "4h": createTimeframeStructure("4h", "MIDDLE"),
      "1d": createTimeframeStructure("1d", "MIDDLE"),
    },
  }),
);
assert(
  breakoutHoldDeferredEntry.action === "ENTRY" &&
    breakoutHoldDeferredEntry.executionDisposition === "DEFERRED_CONFIRMATION",
  "Breakout-hold entries should demand stronger confirmation so continuation setups do not become chase buys.",
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
      createdAt: "2026-04-05T23:10:00.000Z",
    },
  }),
  createAnalysis({
    regime: "PULLBACK_IN_UPTREND",
    pullbackZone: true,
    volumeRecovery: true,
    trendAlignmentScore: 3,
  }),
);
assertEqual(
  confirmedBorderlineEntry.executionDisposition,
  "EXECUTED_AFTER_CONFIRMATION",
  "A borderline bullish setup should execute only when the deferred decision came from the immediately previous hourly cycle.",
);

const staleDeferredEntry = buildPaperTradeDecisionFromAnalysis(
  createContext({
    positionQuantity: 0,
    latestDecision: {
      id: 11,
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
      createdAt: "2026-04-05T22:10:00.000Z",
    },
  }),
  createAnalysis({
    regime: "PULLBACK_IN_UPTREND",
    pullbackZone: true,
    volumeRecovery: true,
    trendAlignmentScore: 3,
  }),
);
assertEqual(
  staleDeferredEntry.executionDisposition,
  "DEFERRED_CONFIRMATION",
  "Older deferred decisions should not satisfy the one-more-hour confirmation rule.",
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

const softProtectiveReduce = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 1 }),
  createAnalysis({
    regime: "PULLBACK_IN_UPTREND",
    currentPrice: 105_000,
    pnlPct: 0.05,
    failedReclaim: true,
    upperRangeChase: true,
    breakdownPressureScore: 2,
    weakeningStage: "SOFT",
  }),
);
assert(
  softProtectiveReduce.action === "REDUCE" &&
    (softProtectiveReduce.targetQuantityFraction ?? 0) < (moderateReduce.targetQuantityFraction ?? 0),
  "Soft weakening should only allow a modest protective reduction, smaller than a clear-weakness reduce.",
);

const softWeakeningHoldWithoutProfit = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 1 }),
  createAnalysis({
    regime: "PULLBACK_IN_UPTREND",
    currentPrice: 98_000,
    pnlPct: -0.02,
    failedReclaim: true,
    breakdownPressureScore: 2,
    weakeningStage: "SOFT",
  }),
);
assertEqual(
  softWeakeningHoldWithoutProfit.action,
  "HOLD",
  "Soft weakening without a profit buffer should not force a protective reduce by itself.",
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
    entryPath: "RECLAIM",
    recoveryQualityScore: 4,
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
      createdAt: "2026-04-05T23:20:00.000Z",
    },
  }),
  createAnalysis({
    regime: "PULLBACK_IN_UPTREND",
    pullbackZone: true,
    volumeRecovery: true,
    trendAlignmentScore: 3,
    timeframes: {
      "1h": createTimeframeStructure("1h", "LOWER"),
      "4h": createTimeframeStructure("4h", "MIDDLE"),
      "1d": createTimeframeStructure("1d", "MIDDLE"),
    },
  }),
);
assert(
  strongAdd.action === "ADD" &&
    borderlineAdd.action === "ADD" &&
    strongAdd.targetCashToUse > borderlineAdd.targetCashToUse,
  "Bullish sizing should be more aggressive for stronger constructive structure than for confirmed borderline adds.",
);

const reclaimAddImmediate = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 1 }),
  createAnalysis({
    regime: "RECLAIM_ATTEMPT",
    pullbackZone: false,
    reclaimStructure: true,
    breakoutHoldStructure: false,
    volumeRecovery: true,
    entryPath: "RECLAIM",
    trendAlignmentScore: 4,
    recoveryQualityScore: 3,
  }),
);
const breakoutAddDeferred = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 1 }),
  createAnalysis({
    regime: "BULL_TREND",
    pullbackZone: false,
    reclaimStructure: false,
    breakoutHoldStructure: true,
    volumeRecovery: true,
    entryPath: "BREAKOUT_HOLD",
    trendAlignmentScore: 3,
    recoveryQualityScore: 2,
    timeframes: {
      "1h": createTimeframeStructure("1h", "UPPER"),
      "4h": createTimeframeStructure("4h", "MIDDLE"),
      "1d": createTimeframeStructure("1d", "MIDDLE"),
    },
  }),
);
assert(
  reclaimAddImmediate.action === "ADD" &&
    reclaimAddImmediate.executionDisposition === "IMMEDIATE" &&
    breakoutAddDeferred.action === "ADD" &&
    breakoutAddDeferred.executionDisposition === "DEFERRED_CONFIRMATION",
  "Add logic should also distinguish faster reclaim continuation from stricter breakout continuation.",
);

const addBlockedByWeakening = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 1 }),
  createAnalysis({
    regime: "PULLBACK_IN_UPTREND",
    pullbackZone: true,
    volumeRecovery: true,
    failedReclaim: true,
    breakdownPressureScore: 2,
    weakeningStage: "SOFT",
  }),
);
assertEqual(
  addBlockedByWeakening.action,
  "HOLD",
  "Adds should stay blocked when the existing hold is still valid but soft weakening is already present.",
);

const weakMidRangePullback = buildPaperTradeDecisionFromAnalysis(
  createContext({ positionQuantity: 0 }),
  createAnalysis({
    regime: "PULLBACK_IN_UPTREND",
    pullbackZone: true,
    volumeRecovery: false,
    reclaimStructure: false,
    breakoutHoldStructure: false,
    timeframes: {
      "1h": createTimeframeStructure("1h", "MIDDLE"),
      "4h": createTimeframeStructure("4h", "MIDDLE"),
      "1d": createTimeframeStructure("1d", "MIDDLE"),
    },
  }),
);
assertEqual(
  weakMidRangePullback.action,
  "HOLD",
  "Mid-range pullbacks without lower-location support or constructive recovery quality should stay on HOLD.",
);

const resolvedPrices = resolvePortfolioMarkPrices(
  "BTC",
  151_000_000,
  {
    BTC: { lastMarkPrice: 146_000_000 },
    ETH: { lastMarkPrice: 3_100_000 },
  },
  {
    BTC: {
      ok: true,
      snapshot: createContext().marketSnapshot,
    },
    ETH: {
      ok: true,
      snapshot: {
        ...createContext().marketSnapshot,
        market: "KRW-ETH",
        asset: "ETH",
        ticker: {
          ...createContext().marketSnapshot.ticker,
          market: "KRW-ETH",
          tradePrice: 3_450_000,
        },
      },
    },
  },
);
assertEqual(
  resolvedPrices.ETH,
  3_450_000,
  "Portfolio exposure should use the fresh hourly batch price for the other tracked asset when it is available.",
);

const softReentryPenalty = buildPaperTradeDecisionFromAnalysis(
  createContext({
    positionQuantity: 0,
    recentExitHours: 6,
    recentExitRealizedPnl: -10_000,
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
    recentExitRealizedPnl: -10_000,
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
          diagnostics: {
            entryPath: "PULLBACK",
            trendAlignmentScore: 4,
            recoveryQualityScore: 2,
            breakdownPressureScore: 1,
            weakeningStage: "NONE",
          },
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
          diagnostics: {
            entryPath: "RECLAIM",
            trendAlignmentScore: 5,
            recoveryQualityScore: 4,
            breakdownPressureScore: 0,
            weakeningStage: "NONE",
          },
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
    decisionMessage.includes("Path: Pullback") &&
    decisionMessage.includes("ETH: Add | Immediate"),
  "/decision should show execution status, signal quality, and the main entry-path diagnostics.",
);

let aggregatePersistCalls = 0;
let sentMessages = 0;
let marketFetchBatchCalls = 0;
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
      nextPaperStartCash: null,
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
  fetchMarketSnapshots: async () => {
    marketFetchBatchCalls += 1;
    return {
      BTC: {
        ok: true,
        snapshot: {
          market: "KRW-BTC",
          asset: "BTC",
          fetchedAt: "2026-04-06T00:00:00.000Z",
          ticker: {
            market: "KRW-BTC",
            tradePrice: 100_000,
            changeRate: 0,
            tradeTimeKst: "2026-04-06T09:00:00",
            tradeTimeUtc: "2026-04-06T00:00:00",
            exchangeTimestampMs: 1712361600000,
            fetchedAt: "2026-04-06T00:00:00.000Z",
          },
          timeframes: {
            "1h": { timeframe: "1h", candles: [] },
            "4h": { timeframe: "4h", candles: [] },
            "1d": { timeframe: "1d", candles: [] },
          },
        },
      },
      ETH: {
        ok: true,
        snapshot: {
          market: "KRW-ETH",
          asset: "ETH",
          fetchedAt: "2026-04-06T00:00:00.000Z",
          ticker: {
            market: "KRW-ETH",
            tradePrice: 3_000_000,
            changeRate: 0,
            tradeTimeKst: "2026-04-06T09:00:00",
            tradeTimeUtc: "2026-04-06T00:00:00",
            exchangeTimestampMs: 1712361600000,
            fetchedAt: "2026-04-06T00:00:00.000Z",
          },
          timeframes: {
            "1h": { timeframe: "1h", candles: [] },
            "4h": { timeframe: "4h", candles: [] },
            "1d": { timeframe: "1d", candles: [] },
          },
        },
      },
    };
  },
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
  marketFetchBatchCalls,
  1,
  "Hourly processing should fetch the BTC/ETH market snapshot batch once per user run before processing both assets.",
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
  recentExitRealizedPnl?: number | null;
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
      realizedPnl: input?.recentExitRealizedPnl ?? null,
    },
    marketSnapshot: {
      market: "KRW-BTC",
      asset: "BTC",
      fetchedAt: "2026-04-06T00:00:00.000Z",
      ticker: {
        market: "KRW-BTC",
        tradePrice: 100_000,
        changeRate: 0,
        tradeTimeKst: "2026-04-06T09:00:00",
        tradeTimeUtc: "2026-04-06T00:00:00",
        exchangeTimestampMs: 1712361600000,
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
    entryPath: "PULLBACK",
    trendAlignmentScore: 5,
    recoveryQualityScore: 2,
    breakdownPressureScore: 0,
    weakeningStage: "NONE",
    averageEntryPrice: 100_000,
    pnlPct: 0,
    ...overrides,
  };
}

function createTimeframeStructure(
  timeframe: TimeframeStructure["timeframe"],
  location: TimeframeStructure["location"] = "MIDDLE",
): TimeframeStructure {
  return {
    timeframe,
    trend: "UP",
    rangeHigh: 105_000,
    rangeLow: 95_000,
    previousRangeLow: 96_000,
    previousRangeHigh: 104_000,
    location,
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

function createMonotonicMarketSnapshot(input: {
  tradePrice: number;
  tradeTimeUtc: string;
  fetchedAt: string;
  oneHourCloses: number[];
  oneHourVolumes?: number[];
  oneHourFinalCloseTime?: string;
  fourHourCloses: number[];
  fourHourVolumes?: number[];
  oneDayCloses: number[];
  oneDayVolumes?: number[];
}): MarketSnapshot {
  return {
    market: "KRW-BTC",
    asset: "BTC",
    fetchedAt: input.fetchedAt,
    ticker: {
      market: "KRW-BTC",
      tradePrice: input.tradePrice,
      changeRate: 0,
      tradeTimeKst: "2026-04-06T19:00:00",
      tradeTimeUtc: input.tradeTimeUtc,
      exchangeTimestampMs: Date.parse(`${input.tradeTimeUtc}Z`),
      fetchedAt: input.fetchedAt,
    },
    timeframes: {
      "1h": {
        timeframe: "1h",
        candles: createMonotonicCandles("1h", input.oneHourCloses, input.oneHourVolumes, "2026-04-06T05:00:00Z", 60, input.oneHourFinalCloseTime),
      },
      "4h": {
        timeframe: "4h",
        candles: createMonotonicCandles("4h", input.fourHourCloses, input.fourHourVolumes, "2026-03-28T00:00:00Z", 240),
      },
      "1d": {
        timeframe: "1d",
        candles: createMonotonicCandles("1d", input.oneDayCloses, input.oneDayVolumes, "2026-03-17T00:00:00Z", 1440),
      },
    },
  };
}

function createMonotonicCandles(
  timeframe: "1h" | "4h" | "1d",
  closes: number[],
  volumes: number[] | undefined,
  startIso: string,
  stepMinutes: number,
  finalCloseTimeOverride?: string,
) {
  const startMs = Date.parse(startIso);
  return closes.map((closePrice, index) => {
    const openedAt = new Date(startMs + index * stepMinutes * 60_000);
    const closedAt = new Date(openedAt.getTime() + stepMinutes * 60_000);
    const previousClose = index > 0 ? closes[index - 1] ?? closePrice : closePrice;
    const volume = volumes?.[index] ?? 100;

    return {
      market: "KRW-BTC" as const,
      timeframe,
      openTime: openedAt.toISOString().slice(0, 19),
      closeTime:
        index === closes.length - 1 && finalCloseTimeOverride
          ? finalCloseTimeOverride
          : closedAt.toISOString().slice(0, 19),
      openPrice: previousClose,
      highPrice: Math.max(previousClose, closePrice) + 1,
      lowPrice: Math.min(previousClose, closePrice) - 1,
      closePrice,
      volume,
      quoteVolume: volume * closePrice,
    };
  });
}
