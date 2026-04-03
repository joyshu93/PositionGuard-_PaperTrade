import type {
  PaperPerformanceSnapshot,
  PaperTrade,
  SupportedAsset,
  SupportedLocale,
} from "../domain/types.js";
import { formatCompactTimestampForLocale, formatNumberForLocale } from "../i18n/index.js";

export function renderPaperStatusMessage(
  snapshot: PaperPerformanceSnapshot,
  locale: SupportedLocale,
): string {
  return [
    "Paper status",
    `Cash: ${formatKrw(locale, snapshot.account.cashBalance)}`,
    renderPositionLine("BTC", snapshot, locale),
    renderPositionLine("ETH", snapshot, locale),
    `Total equity: ${formatKrw(locale, snapshot.totalEquity)}`,
    `Unrealized PnL: ${formatSignedKrw(locale, snapshot.unrealizedPnl)}`,
    "All fills are simulated paper fills.",
  ].join("\n");
}

export function renderPaperPnlMessage(
  snapshot: PaperPerformanceSnapshot,
  locale: SupportedLocale,
): string {
  return [
    "Paper PnL",
    `Realized PnL: ${formatSignedKrw(locale, snapshot.account.realizedPnl)}`,
    `Current equity: ${formatKrw(locale, snapshot.totalEquity)}`,
    `Cumulative return: ${formatPercent(locale, snapshot.cumulativeReturnPct)}`,
    `Win rate: ${snapshot.winRate === null ? "n/a" : formatPercent(locale, snapshot.winRate * 100)}`,
    "Performance is derived from persisted paper account, trade, and equity data.",
  ].join("\n");
}

export function renderPaperHistoryMessage(
  trades: PaperTrade[],
  locale: SupportedLocale,
): string {
  if (trades.length === 0) {
    return "Paper history\nNo simulated trades yet.";
  }

  return [
    "Paper history",
    ...trades.map((trade) =>
      `${formatCompactTimestampForLocale(locale, trade.createdAt)} | ${trade.asset} ${trade.action} ${trade.side} | qty ${formatNumberForLocale(locale, trade.quantity, 8)} | fill ${formatKrw(locale, trade.fillPrice)} | realized ${formatSignedKrw(locale, trade.realizedPnl)}`,
    ),
  ].join("\n");
}

export function buildExecutionSummary(params: {
  asset: SupportedAsset;
  action: "ENTRY" | "ADD" | "REDUCE" | "EXIT";
  quantity: number;
  fillPrice: number;
  realizedPnl: number;
  totalEquity: number;
  cumulativeReturnPct: number;
  locale: SupportedLocale;
}): string {
  const { locale } = params;
  return [
    `Paper execution: ${params.asset} ${params.action}`,
    `Simulated fill: ${formatNumberForLocale(locale, params.quantity, 8)} @ ${formatKrw(locale, params.fillPrice)}`,
    `Realized PnL: ${formatSignedKrw(locale, params.realizedPnl)}`,
    `Total equity: ${formatKrw(locale, params.totalEquity)}`,
    `Cumulative return: ${formatPercent(locale, params.cumulativeReturnPct)}`,
    "This was a simulated paper fill. No real order was sent.",
  ].join("\n");
}

function renderPositionLine(
  asset: SupportedAsset,
  snapshot: PaperPerformanceSnapshot,
  locale: SupportedLocale,
): string {
  const position = snapshot.positions[asset];
  const price = snapshot.latestPrices[asset];

  if (!position || position.quantity <= 0) {
    return `${asset}: flat`;
  }

  const unrealized = price === null ? 0 : (price - position.averageEntryPrice) * position.quantity;
  return [
    `${asset}: qty ${formatNumberForLocale(locale, position.quantity, 8)}`,
    `avg ${formatKrw(locale, position.averageEntryPrice)}`,
    `mark ${price === null ? "n/a" : formatKrw(locale, price)}`,
    `uPnL ${formatSignedKrw(locale, unrealized)}`,
  ].join(" | ");
}

function formatKrw(locale: SupportedLocale, value: number): string {
  return `${formatNumberForLocale(locale, value, 2)} KRW`;
}

function formatSignedKrw(locale: SupportedLocale, value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumberForLocale(locale, value, 2)} KRW`;
}

function formatPercent(locale: SupportedLocale, value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumberForLocale(locale, value, 2)}%`;
}
