import type {
  DecisionExecutionDisposition,
  PaperTradingContext,
  PaperTradingDecision,
  SignalQualityBucket,
} from "../domain/types.js";
import {
  analyzePositionStructure,
  type PositionStructureAnalysis,
} from "../decision/market-structure.js";
import { getDefaultReduceFraction, getDefaultTargetCash } from "./math.js";

const ENTRY_STRONG_THRESHOLD = 8;
const ENTRY_BORDERLINE_THRESHOLD = 6;
const ADD_STRONG_THRESHOLD = 8;
const ADD_BORDERLINE_THRESHOLD = 6;
const REDUCE_THRESHOLD = 4;
const HEALTHY_HOLD_REDUCE_THRESHOLD = 5;
const RECENT_EXIT_PENALTY_HOURS = 24;
const RECENT_LOSS_EXIT_PENALTY_HOURS = 12;
const HOURLY_CONFIRMATION_WINDOW_MS = 60 * 60 * 1000;
const SIGNAL_QUALITY_BUCKETS = ["LOW", "BORDERLINE", "MEDIUM", "HIGH"] as const;
const ENTRY_PATHS = ["NONE", "PULLBACK", "RECLAIM", "BREAKOUT_HOLD"] as const;

type BullishConfirmationSignature = {
  action: "ENTRY" | "ADD";
  entryPath: PositionStructureAnalysis["entryPath"];
  qualityBucket: SignalQualityBucket;
};

export function decidePaperTrade(context: PaperTradingContext): PaperTradingDecision {
  const analysis = analyzePositionStructure(
    context.marketSnapshot,
    context.position?.averageEntryPrice ?? 0,
  );
  return buildPaperTradeDecisionFromAnalysis(context, analysis);
}

export function buildPaperTradeDecisionFromAnalysis(
  context: PaperTradingContext,
  analysis: PositionStructureAnalysis,
): PaperTradingDecision {
  const quantity = context.position?.quantity ?? 0;
  const cashBalance = context.account.cashBalance;
  const bullishEvidence = countBullishEvidence(analysis);
  const weaknessEvidence = countWeaknessEvidence(analysis);
  const reentryPenalty = getReentryPenalty(context, analysis, quantity);
  const reentryPenaltyApplied = reentryPenalty > 0;

  const bullishScore = computeBullishScore(analysis) - reentryPenalty;
  const qualityBucket = toQualityBucket(bullishScore);
  const diagnostics = {
    regime: analysis.regime,
    riskLevel: analysis.riskLevel,
    invalidationState: analysis.invalidationState,
    invalidationLevel: analysis.invalidationLevel,
    pullbackZone: analysis.pullbackZone,
    reclaimStructure: analysis.reclaimStructure,
    breakoutHoldStructure: analysis.breakoutHoldStructure,
    upperRangeChase: analysis.upperRangeChase,
    currentPrice: analysis.currentPrice,
    cashBalance,
    positionQuantity: quantity,
    entryPath: analysis.entryPath,
    trendAlignmentScore: analysis.trendAlignmentScore,
    recoveryQualityScore: analysis.recoveryQualityScore,
    breakdownPressureScore: analysis.breakdownPressureScore,
    weakeningStage: analysis.weakeningStage,
    bullishEvidenceCount: bullishEvidence,
    weaknessEvidenceCount: weaknessEvidence,
  };
  const exposureGuardrails = buildExposureGuardrails(context);

  if (
    analysis.invalidationState === "BROKEN" ||
    analysis.breakdown1d ||
    (analysis.breakdown4h && analysis.bearishMomentumExpansion)
  ) {
    return {
      action: "EXIT",
      summary: `${context.asset} paper exit is required because invalidation has failed.`,
      reasons: [
        `Regime is ${analysis.regime}.`,
        "Higher-timeframe support has broken or invalidation is already broken.",
        "Invalidation-first exit remains immediate and unchanged.",
      ],
      targetCashToUse: 0,
      targetQuantityFraction: 1,
      referencePrice: analysis.currentPrice,
      executionDisposition: "IMMEDIATE",
      signalQuality: {
        score: 0,
        bucket: "LOW",
        confirmationRequired: false,
        confirmationSatisfied: false,
        reentryPenaltyApplied,
      },
      exposureGuardrails,
      diagnostics,
    };
  }

  if (quantity <= 0) {
    return decideFlatPositionAction({
      context,
      analysis,
      bullishScore,
      qualityBucket,
      reentryPenaltyApplied,
      diagnostics,
      exposureGuardrails,
    });
  }

  const reduceDecision = decideReduceAction({
    context,
    analysis,
    weaknessEvidence,
    diagnostics,
    exposureGuardrails,
    reentryPenaltyApplied,
  });
  if (reduceDecision) {
    return reduceDecision;
  }

  return decideAddOrHoldAction({
    context,
    analysis,
    bullishScore,
    qualityBucket,
    reentryPenaltyApplied,
    diagnostics,
    exposureGuardrails,
  });
}

function decideFlatPositionAction(input: {
  context: PaperTradingContext;
  analysis: PositionStructureAnalysis;
  bullishScore: number;
  qualityBucket: SignalQualityBucket;
  reentryPenaltyApplied: boolean;
  diagnostics: PaperTradingDecision["diagnostics"];
  exposureGuardrails: PaperTradingDecision["exposureGuardrails"];
}): PaperTradingDecision {
  const { context, analysis, bullishScore, qualityBucket, reentryPenaltyApplied, diagnostics, exposureGuardrails } = input;
  const thresholds = getBullishThresholds("ENTRY", analysis);

  if (!isConstructiveBullishCandidate(analysis)) {
    return holdDecision(
      context,
      analysis,
      [
        `Regime is ${analysis.regime}.`,
        analysis.upperRangeChase
          ? "Price is too extended for a no-chase entry."
          : "Bullish structure is not strong enough to justify a fresh entry.",
      ],
      diagnostics,
      exposureGuardrails,
      bullishScore,
      qualityBucket,
      reentryPenaltyApplied,
    );
  }

  if (!hasBullishRiskCapacity(context, exposureGuardrails)) {
    return holdDecision(
      context,
      analysis,
      [
        `Regime is ${analysis.regime}.`,
        "Exposure guardrails leave no room for additional risk right now.",
      ],
      diagnostics,
      exposureGuardrails,
      bullishScore,
      qualityBucket,
      reentryPenaltyApplied,
    );
  }

  if (bullishScore >= thresholds.strong) {
    return bullishDecision({
      context,
      analysis,
      action: "ENTRY",
      executionDisposition: "IMMEDIATE",
      qualityBucket,
      bullishScore,
      reentryPenaltyApplied,
      confirmationSatisfied: false,
      allocationMultiplier: getBullishAllocationMultiplier({
        action: "ENTRY",
        analysis,
        executionDisposition: "IMMEDIATE",
      }),
      diagnostics,
      exposureGuardrails,
      extraReasons: [
        `Regime is ${analysis.regime}.`,
        "Constructive structure is strong enough to act immediately.",
        getBullishThresholdReason("ENTRY", analysis),
      ],
    });
  }

  if (bullishScore >= thresholds.borderline) {
    const confirmationSatisfied = hasPendingBullishConfirmation(
      context,
      buildBullishConfirmationSignature("ENTRY", analysis, qualityBucket),
    );
    return bullishDecision({
      context,
      analysis,
      action: "ENTRY",
      executionDisposition: confirmationSatisfied ? "EXECUTED_AFTER_CONFIRMATION" : "DEFERRED_CONFIRMATION",
      qualityBucket,
      bullishScore,
      reentryPenaltyApplied,
      confirmationSatisfied,
      allocationMultiplier: getBullishAllocationMultiplier({
        action: "ENTRY",
        analysis,
        executionDisposition: confirmationSatisfied ? "EXECUTED_AFTER_CONFIRMATION" : "DEFERRED_CONFIRMATION",
      }),
      diagnostics,
      exposureGuardrails,
      extraReasons: confirmationSatisfied
        ? [
            `Regime is ${analysis.regime}.`,
            "Borderline bullish structure held for one additional hourly confirmation.",
            getBullishThresholdReason("ENTRY", analysis),
          ]
        : [
            `Regime is ${analysis.regime}.`,
            "Bullish structure is valid but borderline, so one additional hourly confirmation is required.",
            getBullishThresholdReason("ENTRY", analysis),
          ],
    });
  }

  return holdDecision(
    context,
    analysis,
    [
      `Regime is ${analysis.regime}.`,
      reentryPenaltyApplied
        ? "Recent exit caution slightly raised the entry threshold and the recovery quality is not strong enough yet."
        : "Bullish score did not clear the entry hysteresis threshold.",
      getBullishThresholdReason("ENTRY", analysis),
    ],
    diagnostics,
    exposureGuardrails,
    bullishScore,
    qualityBucket,
    reentryPenaltyApplied,
  );
}

function decideAddOrHoldAction(input: {
  context: PaperTradingContext;
  analysis: PositionStructureAnalysis;
  bullishScore: number;
  qualityBucket: SignalQualityBucket;
  reentryPenaltyApplied: boolean;
  diagnostics: PaperTradingDecision["diagnostics"];
  exposureGuardrails: PaperTradingDecision["exposureGuardrails"];
}): PaperTradingDecision {
  const { context, analysis, bullishScore, qualityBucket, reentryPenaltyApplied, diagnostics, exposureGuardrails } = input;
  const thresholds = getBullishThresholds("ADD", analysis);

  if (!isConstructiveAddCandidate(analysis)) {
    return holdDecision(
      context,
      analysis,
      [
        `Regime is ${analysis.regime}.`,
        analysis.weakeningStage === "SOFT"
          ? "Existing position is still valid, but mild weakening means add quality is not strong enough yet."
          : "Existing position remains valid, but add quality needs stronger trend alignment and recovery structure.",
        getBullishThresholdReason("ADD", analysis),
      ],
      diagnostics,
      exposureGuardrails,
      bullishScore,
      qualityBucket,
      reentryPenaltyApplied,
    );
  }

  if (!hasBullishRiskCapacity(context, exposureGuardrails)) {
    return holdDecision(
      context,
      analysis,
      [
        `Regime is ${analysis.regime}.`,
        "Exposure guardrails leave no room for an additional add.",
      ],
      diagnostics,
      exposureGuardrails,
      bullishScore,
      qualityBucket,
      reentryPenaltyApplied,
    );
  }

  if (bullishScore >= thresholds.strong) {
    return bullishDecision({
      context,
      analysis,
      action: "ADD",
      executionDisposition: "IMMEDIATE",
      qualityBucket,
      bullishScore,
      reentryPenaltyApplied,
      confirmationSatisfied: false,
      allocationMultiplier: getBullishAllocationMultiplier({
        action: "ADD",
        analysis,
        executionDisposition: "IMMEDIATE",
      }),
      diagnostics,
      exposureGuardrails,
      extraReasons: [
        `Regime is ${analysis.regime}.`,
        "Constructive add quality is strong enough for an immediate staged add.",
        getBullishThresholdReason("ADD", analysis),
      ],
    });
  }

  if (bullishScore >= thresholds.borderline) {
    const confirmationSatisfied = hasPendingBullishConfirmation(
      context,
      buildBullishConfirmationSignature("ADD", analysis, qualityBucket),
    );
    return bullishDecision({
      context,
      analysis,
      action: "ADD",
      executionDisposition: confirmationSatisfied ? "EXECUTED_AFTER_CONFIRMATION" : "DEFERRED_CONFIRMATION",
      qualityBucket,
      bullishScore,
      reentryPenaltyApplied,
      confirmationSatisfied,
      allocationMultiplier: getBullishAllocationMultiplier({
        action: "ADD",
        analysis,
        executionDisposition: confirmationSatisfied ? "EXECUTED_AFTER_CONFIRMATION" : "DEFERRED_CONFIRMATION",
      }),
      diagnostics,
      exposureGuardrails,
      extraReasons: confirmationSatisfied
        ? [
            `Regime is ${analysis.regime}.`,
            "Borderline add setup stayed constructive for one more hourly confirmation.",
            getBullishThresholdReason("ADD", analysis),
          ]
        : [
            `Regime is ${analysis.regime}.`,
            "Add setup is valid but borderline, so execution is deferred pending one more hourly confirmation.",
            getBullishThresholdReason("ADD", analysis),
          ],
    });
  }

  return holdDecision(
    context,
    analysis,
    [
      `Regime is ${analysis.regime}.`,
      "Existing hold remains valid, but add quality did not clear the stricter add threshold.",
      getBullishThresholdReason("ADD", analysis),
    ],
    diagnostics,
    exposureGuardrails,
    bullishScore,
    qualityBucket,
    reentryPenaltyApplied,
  );
}

function decideReduceAction(input: {
  context: PaperTradingContext;
  analysis: PositionStructureAnalysis;
  weaknessEvidence: number;
  diagnostics: PaperTradingDecision["diagnostics"];
  exposureGuardrails: PaperTradingDecision["exposureGuardrails"];
  reentryPenaltyApplied: boolean;
}): PaperTradingDecision | null {
  const { context, analysis, weaknessEvidence, diagnostics, exposureGuardrails, reentryPenaltyApplied } = input;
  const weaknessScore = computeWeaknessScore(analysis);
  const reducePlan = getStructuredReducePlan(context, analysis, weaknessScore);
  if (!reducePlan) {
    return null;
  }

  return {
    action: "REDUCE",
    summary: `${context.asset} paper reduction is allowed because weakening is now sufficiently clear.`,
    reasons: [
      `Regime is ${analysis.regime}.`,
      `Weakening stage is ${analysis.weakeningStage}.`,
      ...reducePlan.reasons,
      weaknessEvidence >= 3
        ? "Multiple weakness signals are aligned, so a staged reduction is justified."
        : "Weakness is present, but reduction remains staged rather than full exit.",
    ],
    targetCashToUse: 0,
    targetQuantityFraction: reducePlan.reduceFraction,
    referencePrice: analysis.currentPrice,
    executionDisposition: "IMMEDIATE",
    signalQuality: {
      score: weaknessScore,
      bucket: reducePlan.qualityBucket,
      confirmationRequired: false,
      confirmationSatisfied: false,
      reentryPenaltyApplied,
    },
    exposureGuardrails,
    diagnostics,
  };
}

function bullishDecision(input: {
  context: PaperTradingContext;
  analysis: PositionStructureAnalysis;
  action: "ENTRY" | "ADD";
  executionDisposition: DecisionExecutionDisposition;
  qualityBucket: SignalQualityBucket;
  bullishScore: number;
  reentryPenaltyApplied: boolean;
  confirmationSatisfied: boolean;
  allocationMultiplier: number;
  diagnostics: PaperTradingDecision["diagnostics"];
  exposureGuardrails: PaperTradingDecision["exposureGuardrails"];
  extraReasons: string[];
}): PaperTradingDecision {
  const {
    context,
    analysis,
    action,
    executionDisposition,
    qualityBucket,
    bullishScore,
    reentryPenaltyApplied,
    confirmationSatisfied,
    allocationMultiplier,
    diagnostics,
    exposureGuardrails,
    extraReasons,
  } = input;
  const baseCash = getDefaultTargetCash(action, context.account.cashBalance, context.settings);
  const cappedCash = Math.max(
    0,
    Math.min(
      baseCash * allocationMultiplier,
      context.account.cashBalance,
      exposureGuardrails.remainingAssetCapacity,
      exposureGuardrails.remainingPortfolioCapacity,
    ),
  );

  return {
    action,
    summary:
      executionDisposition === "DEFERRED_CONFIRMATION"
        ? `${context.asset} ${action.toLowerCase()} setup is deferred pending one additional hourly confirmation.`
        : `${context.asset} paper ${action.toLowerCase()} is allowed by constructive structure.`,
    reasons: [
      ...extraReasons,
      getEntryPathReason(analysis),
      reentryPenaltyApplied
        ? "Recent exit caution slightly raised the re-entry threshold, but the current structure still cleared it."
        : "No recent-exit caution is suppressing the setup.",
    ],
    targetCashToUse: cappedCash,
    targetQuantityFraction: null,
    referencePrice: analysis.currentPrice,
    executionDisposition,
    signalQuality: {
      score: bullishScore,
      bucket: qualityBucket,
      confirmationRequired: executionDisposition === "DEFERRED_CONFIRMATION" || confirmationSatisfied,
      confirmationSatisfied,
      reentryPenaltyApplied,
    },
    exposureGuardrails,
    diagnostics,
  };
}

function holdDecision(
  context: PaperTradingContext,
  analysis: PositionStructureAnalysis,
  reasons: string[],
  diagnostics: PaperTradingDecision["diagnostics"],
  exposureGuardrails: PaperTradingDecision["exposureGuardrails"],
  score: number,
  qualityBucket: SignalQualityBucket,
  reentryPenaltyApplied: boolean,
): PaperTradingDecision {
  const hasPosition = (context.position?.quantity ?? 0) > 0;
  return {
    action: "HOLD",
    summary: hasPosition
      ? `${context.asset} stays on hold while the existing paper position remains valid.`
      : `${context.asset} stays on hold because entry quality is not strong enough yet.`,
    reasons,
    targetCashToUse: 0,
    targetQuantityFraction: null,
    referencePrice: analysis.currentPrice,
    executionDisposition: "SKIPPED",
    signalQuality: {
      score,
      bucket: qualityBucket,
      confirmationRequired: false,
      confirmationSatisfied: false,
      reentryPenaltyApplied,
    },
    exposureGuardrails,
    diagnostics,
  };
}

function buildExposureGuardrails(context: PaperTradingContext): PaperTradingDecision["exposureGuardrails"] {
  const totalEquity = Math.max(context.portfolio.totalEquity, context.account.cashBalance);
  const perAssetLimitValue = totalEquity * context.settings.perAssetMaxAllocation;
  const totalExposureLimitValue = totalEquity * context.settings.totalPortfolioMaxExposure;

  return {
    perAssetMaxAllocation: context.settings.perAssetMaxAllocation,
    totalPortfolioMaxExposure: context.settings.totalPortfolioMaxExposure,
    remainingAssetCapacity: Math.max(0, perAssetLimitValue - context.portfolio.assetMarketValue),
    remainingPortfolioCapacity: Math.max(0, totalExposureLimitValue - context.portfolio.totalExposureValue),
  };
}

function hasBullishRiskCapacity(
  context: PaperTradingContext,
  exposureGuardrails: PaperTradingDecision["exposureGuardrails"],
): boolean {
  return context.account.cashBalance >= context.settings.minimumTradeValueKrw
    && exposureGuardrails.remainingAssetCapacity >= context.settings.minimumTradeValueKrw
    && exposureGuardrails.remainingPortfolioCapacity >= context.settings.minimumTradeValueKrw;
}

function hasPendingBullishConfirmation(
  context: PaperTradingContext,
  signature: BullishConfirmationSignature,
): boolean {
  const latestDecision = context.latestDecision;
  if (
    !latestDecision
    || latestDecision.action !== signature.action
    || latestDecision.executionStatus !== "SKIPPED"
  ) {
    return false;
  }

  const rationale = readDecisionRationale(latestDecision.rationale);
  return rationale.executionDisposition === "DEFERRED_CONFIRMATION"
    && rationale.entryPath === signature.entryPath
    && rationale.qualityBucket === signature.qualityBucket
    && isImmediatePreviousHourlyDecision(latestDecision.createdAt, context.generatedAt);
}

function buildBullishConfirmationSignature(
  action: "ENTRY" | "ADD",
  analysis: PositionStructureAnalysis,
  qualityBucket: SignalQualityBucket,
): BullishConfirmationSignature {
  return {
    action,
    entryPath: analysis.entryPath,
    qualityBucket,
  };
}

function isImmediatePreviousHourlyDecision(
  latestDecisionCreatedAt: string,
  currentGeneratedAt: string,
): boolean {
  const latestBucket = toHourlyBucketMs(latestDecisionCreatedAt);
  const currentBucket = toHourlyBucketMs(currentGeneratedAt);

  if (latestBucket === null || currentBucket === null) {
    return false;
  }

  return currentBucket - latestBucket === HOURLY_CONFIRMATION_WINDOW_MS;
}

function toHourlyBucketMs(value: string): number | null {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const bucket = new Date(timestamp);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket.getTime();
}

function computeBullishScore(analysis: PositionStructureAnalysis): number {
  let score = 0;

  if (analysis.regime === "BULL_TREND") score += 3;
  else if (analysis.regime === "PULLBACK_IN_UPTREND") score += 3;
  else if (analysis.regime === "EARLY_RECOVERY") score += 2;
  else if (analysis.regime === "RECLAIM_ATTEMPT") score += 1;

  if (analysis.invalidationState === "CLEAR") score += 2;
  if (hasConstructivePullbackQuality(analysis)) score += 1;
  else if (analysis.pullbackZone) score -= 1;
  if (analysis.reclaimStructure) score += 2;
  if (analysis.breakoutHoldStructure) score += 2;
  if (analysis.volumeRecovery) score += 1;
  if (analysis.macdImproving) score += 1;
  if (analysis.rsiRecovery) score += 1;
  if (analysis.upperRangeChase) score -= 2;
  if (analysis.breakdown4h) score -= 3;
  if (analysis.breakdown1d) score -= 4;
  if (analysis.trendAlignmentScore >= 4) score += 1;
  if (analysis.recoveryQualityScore >= 4) score += 1;
  if (analysis.entryPath === "NONE") score -= 1;
  if (analysis.breakdownPressureScore >= 3) score -= 1;

  return score;
}

function computeWeaknessScore(analysis: PositionStructureAnalysis): number {
  let score = 0;

  if (analysis.riskLevel === "ELEVATED") score += 2;
  if (analysis.failedReclaim) score += 2;
  if (analysis.bearishMomentumExpansion) score += 2;
  if (analysis.breakdown4h) score += 2;
  if (analysis.regime === "WEAK_DOWNTREND") score += 1;
  if (analysis.atrShock) score += 1;
  if (analysis.upperRangeChase && analysis.timeframes["1h"].trend === "DOWN") score += 1;

  return score;
}

function getBullishThresholds(
  action: "ENTRY" | "ADD",
  analysis: PositionStructureAnalysis,
): {
  strong: number;
  borderline: number;
} {
  let strong = action === "ENTRY" ? ENTRY_STRONG_THRESHOLD : ADD_STRONG_THRESHOLD;
  let borderline = action === "ENTRY" ? ENTRY_BORDERLINE_THRESHOLD : ADD_BORDERLINE_THRESHOLD;

  switch (analysis.entryPath) {
    case "RECLAIM":
      if (analysis.recoveryQualityScore >= 3 && analysis.trendAlignmentScore >= 3) {
        strong -= 1;
        borderline -= 1;
      }
      break;
    case "BREAKOUT_HOLD":
      strong += 1;
      borderline += 1;
      if (analysis.timeframes["1h"].location === "UPPER") {
        strong += 1;
        borderline += 1;
      }
      break;
    case "PULLBACK":
      if (action === "ADD") {
        strong += 1;
        borderline += 1;
      }
      if (analysis.timeframes["1h"].location !== "LOWER" && analysis.timeframes["4h"].location !== "LOWER") {
        strong += 1;
        borderline += 1;
      }
      break;
    case "NONE":
    default:
      break;
  }

  if (analysis.breakdownPressureScore >= 2 && action === "ADD") {
    strong += 1;
    borderline += 1;
  }

  borderline = Math.min(borderline, strong - 1);
  return { strong, borderline };
}

function countBullishEvidence(analysis: PositionStructureAnalysis): number {
  return [
    analysis.pullbackZone,
    analysis.reclaimStructure,
    analysis.breakoutHoldStructure,
    analysis.volumeRecovery,
    analysis.macdImproving,
    analysis.rsiRecovery,
    analysis.invalidationState === "CLEAR",
  ].filter(Boolean).length;
}

function countWeaknessEvidence(analysis: PositionStructureAnalysis): number {
  return [
    analysis.failedReclaim,
    analysis.bearishMomentumExpansion,
    analysis.breakdown4h,
    analysis.atrShock,
    analysis.regime === "WEAK_DOWNTREND",
  ].filter(Boolean).length;
}

function isConstructiveBullishCandidate(analysis: PositionStructureAnalysis): boolean {
  return analysis.invalidationState === "CLEAR"
    && !analysis.upperRangeChase
    && !analysis.breakdown1d
    && !analysis.breakdown4h
    && (hasConstructivePullbackQuality(analysis) || analysis.reclaimStructure || analysis.breakoutHoldStructure)
    && (
      analysis.regime === "BULL_TREND"
      || analysis.regime === "PULLBACK_IN_UPTREND"
      || analysis.regime === "EARLY_RECOVERY"
      || analysis.regime === "RECLAIM_ATTEMPT"
    );
}

function isConstructiveAddCandidate(analysis: PositionStructureAnalysis): boolean {
  return isConstructiveBullishCandidate(analysis)
    && isHealthyHoldState(analysis)
    && analysis.breakdownPressureScore <= 1
    && analysis.trendAlignmentScore >= 3
    && (
      analysis.entryPath === "RECLAIM"
      || analysis.entryPath === "BREAKOUT_HOLD"
      || (analysis.entryPath === "PULLBACK" && analysis.recoveryQualityScore >= 2)
    );
}

function getBullishThresholdReason(
  action: "ENTRY" | "ADD",
  analysis: PositionStructureAnalysis,
): string {
  switch (analysis.entryPath) {
    case "RECLAIM":
      return action === "ADD"
        ? "Reclaim paths can add faster than raw pullbacks, but only when continuation quality stays healthy."
        : "Reclaim paths can clear a slightly faster threshold when recovery quality is already convincing.";
    case "BREAKOUT_HOLD":
      return "Breakout-hold paths require stronger confirmation so continuation entries do not turn into chase buying.";
    case "PULLBACK":
      return action === "ADD"
        ? "Pullback adds stay stricter than fresh entries, especially when the pullback is not clearly lower in the range."
        : "Pullback entries still need a constructive lower-range structure or clear recovery support.";
    case "NONE":
    default:
      return "No constructive entry path is active.";
  }
}

function hasConstructivePullbackQuality(analysis: PositionStructureAnalysis): boolean {
  return analysis.pullbackZone && (
    analysis.timeframes["1h"].location === "LOWER"
    || analysis.timeframes["4h"].location === "LOWER"
    || (
      analysis.timeframes["1h"].location === "MIDDLE"
      && analysis.volumeRecovery
      && analysis.timeframes["4h"].trend !== "DOWN"
    )
  );
}

function isHealthyHoldState(analysis: PositionStructureAnalysis): boolean {
  return analysis.invalidationState === "CLEAR"
    && !analysis.failedReclaim
    && !analysis.bearishMomentumExpansion
    && analysis.regime !== "WEAK_DOWNTREND";
}

function getGraduatedReduceFraction(
  weaknessScore: number,
  context: PaperTradingContext,
): number {
  const base = getDefaultReduceFraction(context.settings);
  if (weaknessScore >= 7) {
    return Math.min(0.9, base * 1.75);
  }
  if (weaknessScore >= 5) {
    return Math.min(0.75, base * 1.2);
  }
  return Math.max(0.2, base * 0.65);
}

function getStructuredReducePlan(
  context: PaperTradingContext,
  analysis: PositionStructureAnalysis,
  weaknessScore: number,
): {
  reduceFraction: number;
  qualityBucket: SignalQualityBucket;
  reasons: string[];
} | null {
  const hasProfitBuffer = analysis.pnlPct >= 0.02;

  if (analysis.weakeningStage === "SOFT") {
    if (!hasProfitBuffer || (!analysis.failedReclaim && !analysis.upperRangeChase && analysis.breakdownPressureScore < 2)) {
      return null;
    }

    return {
      reduceFraction: getSoftReduceFraction(context, analysis),
      qualityBucket: "BORDERLINE",
      reasons: [
        "Weakening is still soft, so any reduction stays modest and mainly protects open gains.",
      ],
    };
  }

  const reduceThreshold = analysis.weakeningStage === "CLEAR"
    ? Math.max(3, (isHealthyHoldState(analysis) ? HEALTHY_HOLD_REDUCE_THRESHOLD : REDUCE_THRESHOLD) - 1)
    : isHealthyHoldState(analysis)
      ? HEALTHY_HOLD_REDUCE_THRESHOLD
      : REDUCE_THRESHOLD;

  if (weaknessScore < reduceThreshold) {
    return null;
  }

  return {
    reduceFraction: getGraduatedReduceFraction(weaknessScore, context),
    qualityBucket: weaknessScore >= 7 ? "HIGH" : weaknessScore >= 5 ? "MEDIUM" : "BORDERLINE",
    reasons: [
      analysis.weakeningStage === "CLEAR"
        ? "Weakening has become clear enough that a larger staged reduction is now justified."
        : "Weakening evidence cleared the reduce hysteresis threshold.",
    ],
  };
}

function getSoftReduceFraction(
  context: PaperTradingContext,
  analysis: PositionStructureAnalysis,
): number {
  const base = getDefaultReduceFraction(context.settings);
  let fraction = Math.max(0.15, Math.min(0.25, base * 0.5));

  if (analysis.upperRangeChase || analysis.pnlPct >= 0.05) {
    fraction = Math.max(fraction, 0.25);
  }

  return Math.min(0.35, fraction);
}

function getBullishAllocationMultiplier(input: {
  action: "ENTRY" | "ADD";
  analysis: PositionStructureAnalysis;
  executionDisposition: DecisionExecutionDisposition;
}): number {
  const { action, analysis, executionDisposition } = input;
  let multiplier = action === "ENTRY" ? 0.72 : 0.48;

  if (analysis.entryPath === "RECLAIM") multiplier += 0.16;
  else if (analysis.entryPath === "BREAKOUT_HOLD") multiplier += 0.12;
  else if (
    analysis.entryPath === "PULLBACK"
    && (
      analysis.timeframes["1h"].location === "LOWER"
      || analysis.timeframes["4h"].location === "LOWER"
    )
  ) {
    multiplier += 0.08;
  }

  if (analysis.trendAlignmentScore >= 4) multiplier += 0.08;
  else if (analysis.trendAlignmentScore <= 2) multiplier -= 0.05;

  if (analysis.recoveryQualityScore >= 4) multiplier += 0.08;
  else if (analysis.recoveryQualityScore <= 1) multiplier -= 0.08;

  if (executionDisposition === "EXECUTED_AFTER_CONFIRMATION") multiplier -= 0.08;
  if (executionDisposition === "DEFERRED_CONFIRMATION") multiplier -= 0.18;

  const minimum = action === "ENTRY" ? 0.35 : 0.25;
  const maximum = action === "ENTRY" ? 1 : 0.9;
  return Math.max(minimum, Math.min(maximum, multiplier));
}

function getReentryPenalty(
  context: PaperTradingContext,
  analysis: PositionStructureAnalysis,
  quantity: number,
): number {
  if (
    quantity > 0
    || context.recentExit.hoursSinceExit === null
    || context.recentExit.hoursSinceExit > RECENT_EXIT_PENALTY_HOURS
  ) {
    return 0;
  }

  let penalty = 1;
  if (
    context.recentExit.hoursSinceExit <= RECENT_LOSS_EXIT_PENALTY_HOURS
    && (context.recentExit.realizedPnl ?? 0) <= 0
  ) {
    penalty += 1;
  }

  if (analysis.reclaimStructure && analysis.recoveryQualityScore >= 3) {
    penalty -= 1;
  }

  return Math.max(0, penalty);
}

function getEntryPathReason(analysis: PositionStructureAnalysis): string {
  switch (analysis.entryPath) {
    case "RECLAIM":
      return "Reclaim structure is intact.";
    case "BREAKOUT_HOLD":
      return "Breakout-hold structure is intact.";
    case "PULLBACK":
      return "Constructive pullback structure is available.";
    case "NONE":
    default:
      return "No constructive entry path is active.";
  }
}

function toQualityBucket(score: number): SignalQualityBucket {
  if (score >= 8) return "HIGH";
  if (score >= 6) return "MEDIUM";
  if (score >= 4) return "BORDERLINE";
  return "LOW";
}

function readDecisionRationale(rationale: unknown): {
  executionDisposition?: DecisionExecutionDisposition;
  entryPath?: PositionStructureAnalysis["entryPath"];
  qualityBucket?: SignalQualityBucket;
} {
  if (!rationale || typeof rationale !== "object") {
    return {};
  }

  const value = rationale as Record<string, unknown>;

  const next: {
    executionDisposition?: DecisionExecutionDisposition;
    entryPath?: PositionStructureAnalysis["entryPath"];
    qualityBucket?: SignalQualityBucket;
  } = {};

  if (typeof value.executionDisposition === "string") {
    next.executionDisposition = value.executionDisposition as DecisionExecutionDisposition;
  }

  if (value.signalQuality && typeof value.signalQuality === "object") {
    const bucket = (value.signalQuality as Record<string, unknown>).bucket;
    if (typeof bucket === "string" && isSignalQualityBucket(bucket)) {
      next.qualityBucket = bucket;
    }
  }

  if (value.diagnostics && typeof value.diagnostics === "object") {
    const entryPath = (value.diagnostics as Record<string, unknown>).entryPath;
    if (typeof entryPath === "string" && isEntryPath(entryPath)) {
      next.entryPath = entryPath;
    }
  }

  return next;
}

function isSignalQualityBucket(value: string): value is SignalQualityBucket {
  return (SIGNAL_QUALITY_BUCKETS as readonly string[]).includes(value);
}

function isEntryPath(value: string): value is PositionStructureAnalysis["entryPath"] {
  return (ENTRY_PATHS as readonly string[]).includes(value);
}
