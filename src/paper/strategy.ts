import type {
  PaperTradingContext,
  PaperTradingDecision,
} from "../domain/types.js";
import { analyzePositionStructure } from "../decision/market-structure.js";
import {
  getDefaultReduceFraction,
  getDefaultTargetCash,
} from "./math.js";

export function decidePaperTrade(context: PaperTradingContext): PaperTradingDecision {
  const analysis = analyzePositionStructure(
    context.marketSnapshot,
    context.position?.averageEntryPrice ?? 0,
  );
  const quantity = context.position?.quantity ?? 0;
  const cashBalance = context.account.cashBalance;
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
  };

  if (quantity <= 0) {
    if (
      cashBalance > 0 &&
      analysis.invalidationState === "CLEAR" &&
      !analysis.upperRangeChase &&
      !analysis.breakdown1d &&
      !analysis.breakdown4h &&
      (analysis.pullbackZone || analysis.reclaimStructure || analysis.breakoutHoldStructure) &&
      (analysis.regime === "BULL_TREND" ||
        analysis.regime === "PULLBACK_IN_UPTREND" ||
        analysis.regime === "EARLY_RECOVERY" ||
        analysis.regime === "RECLAIM_ATTEMPT")
    ) {
      return {
        action: "ENTRY",
        summary: `${context.asset} paper entry is allowed by constructive structure.`,
        reasons: [
          `Regime is ${analysis.regime}.`,
          analysis.pullbackZone
            ? "Pullback zone is available."
            : "Reclaim or breakout-hold structure is available.",
          "Invalidation is still clear.",
          "No chase-buy condition is active.",
        ],
        targetCashToUse: getDefaultTargetCash("ENTRY", cashBalance, context.settings),
        targetQuantityFraction: null,
        referencePrice: analysis.currentPrice,
        diagnostics,
      };
    }

    return {
      action: "HOLD",
      summary: `${context.asset} stays on hold because entry conditions are not conservative enough.`,
      reasons: [
        `Regime is ${analysis.regime}.`,
        analysis.upperRangeChase
          ? "Price is too extended for a no-chase entry."
          : "Structure is not strong enough for a new paper entry.",
      ],
      targetCashToUse: 0,
      targetQuantityFraction: null,
      referencePrice: analysis.currentPrice,
      diagnostics,
    };
  }

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
        "Survival first overrides hold-and-hope.",
      ],
      targetCashToUse: 0,
      targetQuantityFraction: 1,
      referencePrice: analysis.currentPrice,
      diagnostics,
    };
  }

  if (
    analysis.riskLevel === "ELEVATED" &&
    (analysis.failedReclaim || analysis.bearishMomentumExpansion || analysis.regime === "WEAK_DOWNTREND")
  ) {
    return {
      action: "REDUCE",
      summary: `${context.asset} paper reduction is allowed because structure is weakening.`,
        reasons: [
          `Regime is ${analysis.regime}.`,
          "Weakness is confirmed enough to reduce exposure conservatively.",
          "Invalidation-first rotation is preferred over revenge holding.",
        ],
        targetCashToUse: 0,
        targetQuantityFraction: getDefaultReduceFraction(context.settings),
        referencePrice: analysis.currentPrice,
        diagnostics,
    };
  }

  if (
    cashBalance > 0 &&
    analysis.invalidationState === "CLEAR" &&
    !analysis.upperRangeChase &&
    !analysis.breakdown1d &&
    (analysis.pullbackZone || analysis.reclaimStructure) &&
    (analysis.regime === "BULL_TREND" ||
      analysis.regime === "PULLBACK_IN_UPTREND" ||
      analysis.regime === "EARLY_RECOVERY" ||
      analysis.regime === "RECLAIM_ATTEMPT")
  ) {
    return {
      action: "ADD",
      summary: `${context.asset} paper add is allowed by staged pullback or reclaim structure.`,
        reasons: [
          `Regime is ${analysis.regime}.`,
        analysis.pullbackZone
          ? "Current location is a staged pullback zone."
          : "Reclaim structure remains intact.",
        "Cash reserve is still available.",
        "No chase-buy condition is active.",
        ],
        targetCashToUse: getDefaultTargetCash("ADD", cashBalance, context.settings),
        targetQuantityFraction: null,
        referencePrice: analysis.currentPrice,
        diagnostics,
    };
  }

  return {
    action: "HOLD",
    summary: `${context.asset} stays on hold while the existing paper position remains valid.`,
    reasons: [
      `Regime is ${analysis.regime}.`,
      "No add, reduce, or exit condition is strong enough right now.",
    ],
    targetCashToUse: 0,
    targetQuantityFraction: null,
    referencePrice: analysis.currentPrice,
    diagnostics,
  };
}
