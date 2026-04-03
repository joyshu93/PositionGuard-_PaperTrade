import type {
  EquitySnapshot,
  PaperAccount,
  PaperPosition,
  PaperTrade,
  PaperTradeAction,
  PaperTradeSide,
  SupportedAsset,
} from "../domain/types.js";
import {
  PAPER_ADD_ALLOCATION,
  PAPER_ENTRY_ALLOCATION,
  PAPER_FEE_RATE,
  PAPER_MIN_TRADE_VALUE_KRW,
  PAPER_REDUCE_FRACTION,
  PAPER_SLIPPAGE_RATE,
} from "./constants.js";

export interface SimulatedFill {
  action: Exclude<PaperTradeAction, "HOLD">;
  side: PaperTradeSide;
  quantity: number;
  fillPrice: number;
  grossAmount: number;
  feeAmount: number;
  realizedPnl: number;
  slippageRate: number;
}

export function roundMoney(value: number): number {
  return Number(value.toFixed(6));
}

export function roundQuantity(value: number): number {
  return Number(value.toFixed(12));
}

export function getPaperBuyFillPrice(referencePrice: number): number {
  return roundMoney(referencePrice * (1 + PAPER_SLIPPAGE_RATE));
}

export function getPaperSellFillPrice(referencePrice: number): number {
  return roundMoney(referencePrice * (1 - PAPER_SLIPPAGE_RATE));
}

export function getMaxAffordableQuantity(cashBalance: number, fillPrice: number): number {
  if (cashBalance <= 0 || fillPrice <= 0) {
    return 0;
  }

  return roundQuantity(cashBalance / (fillPrice * (1 + PAPER_FEE_RATE)));
}

export function calculateBuyQuantity(targetCashToUse: number, cashBalance: number, fillPrice: number): number {
  const usableCash = Math.min(targetCashToUse, cashBalance);
  if (usableCash < PAPER_MIN_TRADE_VALUE_KRW) {
    return 0;
  }

  return roundQuantity(usableCash / (fillPrice * (1 + PAPER_FEE_RATE)));
}

export function calculateSellQuantity(positionQuantity: number, fraction: number): number {
  if (positionQuantity <= 0 || fraction <= 0) {
    return 0;
  }

  return roundQuantity(positionQuantity * Math.min(1, fraction));
}

export function calculateBuyFill(
  action: "ENTRY" | "ADD",
  quantity: number,
  referencePrice: number,
): SimulatedFill | null {
  if (quantity <= 0) {
    return null;
  }

  const fillPrice = getPaperBuyFillPrice(referencePrice);
  const grossAmount = roundMoney(quantity * fillPrice);
  if (grossAmount < PAPER_MIN_TRADE_VALUE_KRW) {
    return null;
  }

  const feeAmount = roundMoney(grossAmount * PAPER_FEE_RATE);

  return {
    action,
    side: "BUY",
    quantity,
    fillPrice,
    grossAmount,
    feeAmount,
    realizedPnl: 0,
    slippageRate: PAPER_SLIPPAGE_RATE,
  };
}

export function calculateSellFill(
  action: "REDUCE" | "EXIT",
  quantity: number,
  referencePrice: number,
  averageEntryPrice: number,
): SimulatedFill | null {
  if (quantity <= 0) {
    return null;
  }

  const fillPrice = getPaperSellFillPrice(referencePrice);
  const grossAmount = roundMoney(quantity * fillPrice);
  if (grossAmount < PAPER_MIN_TRADE_VALUE_KRW) {
    return null;
  }

  const feeAmount = roundMoney(grossAmount * PAPER_FEE_RATE);
  const realizedPnl = roundMoney((fillPrice - averageEntryPrice) * quantity - feeAmount);

  return {
    action,
    side: "SELL",
    quantity,
    fillPrice,
    grossAmount,
    feeAmount,
    realizedPnl,
    slippageRate: PAPER_SLIPPAGE_RATE,
  };
}

export function applyPaperFill(params: {
  account: PaperAccount;
  position: PaperPosition | null;
  asset: SupportedAsset;
  market: "KRW-BTC" | "KRW-ETH";
  fill: SimulatedFill;
}): {
  account: PaperAccount;
  position: PaperPosition;
} {
  const { account, position, asset, market, fill } = params;

  if (fill.side === "BUY") {
    const totalCost = roundMoney(fill.grossAmount + fill.feeAmount);
    const nextCashBalance = Math.max(0, roundMoney(account.cashBalance - totalCost));
    const previousQuantity = position?.quantity ?? 0;
    const nextQuantity = roundQuantity(previousQuantity + fill.quantity);
    const previousCostBasis = previousQuantity * (position?.averageEntryPrice ?? 0);
    const nextAverageEntryPrice =
      nextQuantity > 0
        ? roundMoney((previousCostBasis + fill.grossAmount + fill.feeAmount) / nextQuantity)
        : 0;

    return {
      account: {
        ...account,
        cashBalance: nextCashBalance,
        totalFeesPaid: roundMoney(account.totalFeesPaid + fill.feeAmount),
        updatedAt: new Date().toISOString(),
      },
      position: {
        id: position?.id ?? 0,
        userId: account.userId,
        asset,
        market,
        quantity: nextQuantity,
        averageEntryPrice: nextAverageEntryPrice,
        lastMarkPrice: fill.fillPrice,
        realizedPnl: position?.realizedPnl ?? 0,
        createdAt: position?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }

  const currentQuantity = position?.quantity ?? 0;
  const nextQuantity = Math.max(0, roundQuantity(currentQuantity - fill.quantity));
  const nextCashBalance = roundMoney(account.cashBalance + fill.grossAmount - fill.feeAmount);

  return {
    account: {
      ...account,
      cashBalance: nextCashBalance,
      realizedPnl: roundMoney(account.realizedPnl + fill.realizedPnl),
      totalFeesPaid: roundMoney(account.totalFeesPaid + fill.feeAmount),
      updatedAt: new Date().toISOString(),
    },
    position:
      nextQuantity <= 0
        ? {
            id: position?.id ?? 0,
            userId: account.userId,
            asset,
            market,
            quantity: 0,
            averageEntryPrice: 0,
            lastMarkPrice: fill.fillPrice,
            realizedPnl: roundMoney((position?.realizedPnl ?? 0) + fill.realizedPnl),
            createdAt: position?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : {
            id: position?.id ?? 0,
            userId: account.userId,
            asset,
            market,
            quantity: nextQuantity,
            averageEntryPrice: position?.averageEntryPrice ?? 0,
            lastMarkPrice: fill.fillPrice,
            realizedPnl: roundMoney((position?.realizedPnl ?? 0) + fill.realizedPnl),
            createdAt: position?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
  };
}

export function calculatePositionMarketValue(position: PaperPosition | null, markPrice: number | null): number {
  if (!position || position.quantity <= 0 || markPrice === null || markPrice <= 0) {
    return 0;
  }

  return roundMoney(position.quantity * markPrice);
}

export function calculateUnrealizedPnl(position: PaperPosition | null, markPrice: number | null): number {
  if (!position || position.quantity <= 0 || markPrice === null || markPrice <= 0) {
    return 0;
  }

  return roundMoney((markPrice - position.averageEntryPrice) * position.quantity);
}

export function buildEquitySnapshot(params: {
  userId: number;
  account: PaperAccount;
  asset: SupportedAsset | null;
  positions: Record<SupportedAsset, PaperPosition | null>;
  latestPrices: Record<SupportedAsset, number | null>;
}): Omit<EquitySnapshot, "id" | "createdAt"> {
  const positionMarketValue = roundMoney(
    calculatePositionMarketValue(params.positions.BTC, params.latestPrices.BTC) +
      calculatePositionMarketValue(params.positions.ETH, params.latestPrices.ETH),
  );
  const unrealizedPnl = roundMoney(
    calculateUnrealizedPnl(params.positions.BTC, params.latestPrices.BTC) +
      calculateUnrealizedPnl(params.positions.ETH, params.latestPrices.ETH),
  );
  const totalEquity = roundMoney(params.account.cashBalance + positionMarketValue);
  const totalReturnPct =
    params.account.initialCash > 0
      ? Number((((totalEquity - params.account.initialCash) / params.account.initialCash) * 100).toFixed(4))
      : 0;

  return {
    userId: params.userId,
    accountId: params.account.id,
    asset: params.asset,
    cashBalance: params.account.cashBalance,
    positionMarketValue,
    totalEquity,
    realizedPnl: params.account.realizedPnl,
    unrealizedPnl,
    totalReturnPct,
  };
}

export function getDefaultTargetCash(action: "ENTRY" | "ADD", cashBalance: number): number {
  const ratio = action === "ENTRY" ? PAPER_ENTRY_ALLOCATION : PAPER_ADD_ALLOCATION;
  return roundMoney(cashBalance * ratio);
}

export function getDefaultReduceFraction(): number {
  return PAPER_REDUCE_FRACTION;
}

export function tradeIsWin(trade: PaperTrade): boolean | null {
  if (trade.side !== "SELL") {
    return null;
  }

  return trade.realizedPnl > 0;
}
