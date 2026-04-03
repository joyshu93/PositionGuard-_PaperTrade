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
    locale === "ko" ? "실전 상태" : "Paper status",
    `${label(locale, "cash")}: ${formatKrw(locale, snapshot.account.cashBalance)}`,
    `${label(locale, "equity")}: ${formatKrw(locale, snapshot.totalEquity)}`,
    `${label(locale, "realized")}: ${formatSignedKrw(locale, snapshot.account.realizedPnl)}`,
    `${label(locale, "unrealized")}: ${formatSignedKrw(locale, snapshot.unrealizedPnl)}`,
    `${label(locale, "return")}: ${formatPercent(locale, snapshot.cumulativeReturnPct)}`,
    renderCompactPositionLine("BTC", snapshot, locale),
    renderCompactPositionLine("ETH", snapshot, locale),
    locale === "ko"
      ? "모든 체결은 모의 체결이며 실제 주문은 전송되지 않습니다."
      : "All fills are simulated paper fills. No real order was sent.",
  ].join("\n");
}

export function renderPaperPositionsMessage(
  snapshot: PaperPerformanceSnapshot,
  locale: SupportedLocale,
): string {
  return [
    locale === "ko" ? "포지션" : "Positions",
    renderDetailedPositionLine("BTC", snapshot, locale),
    renderDetailedPositionLine("ETH", snapshot, locale),
    locale === "ko"
      ? "BTC와 ETH 현물 모의 포지션만 표시합니다."
      : "Showing BTC and ETH spot paper positions only.",
  ].join("\n");
}

export function renderPaperPnlMessage(
  snapshot: PaperPerformanceSnapshot,
  locale: SupportedLocale,
): string {
  return [
    locale === "ko" ? "손익" : "Paper PnL",
    `${label(locale, "realized")}: ${formatSignedKrw(locale, snapshot.account.realizedPnl)}`,
    `${label(locale, "realized_trades")}: ${formatSignedKrw(locale, snapshot.cumulativeRealizedPnlFromTrades)}`,
    `${label(locale, "unrealized")}: ${formatSignedKrw(locale, snapshot.unrealizedPnl)}`,
    `${label(locale, "equity")}: ${formatKrw(locale, snapshot.totalEquity)}`,
    `${label(locale, "return")}: ${formatPercent(locale, snapshot.cumulativeReturnPct)}`,
    `${label(locale, "closed_trades")}: ${formatNumberForLocale(locale, snapshot.cumulativeClosedTradeCount, 0)}`,
    `${label(locale, "win_rate")}: ${
      snapshot.cumulativeWinRate === null
        ? na(locale)
        : formatPercent(locale, snapshot.cumulativeWinRate * 100)
    }`,
    locale === "ko"
      ? "누적 통계는 저장된 전체 매도 체결 이력 기준입니다."
      : "Cumulative stats are derived from the full persisted closed-trade history.",
  ].join("\n");
}

export function renderPaperHistoryMessage(
  trades: PaperTrade[],
  locale: SupportedLocale,
): string {
  if (trades.length === 0) {
    return locale === "ko" ? "거래 내역\n아직 모의 체결이 없습니다." : "Paper history\nNo simulated trades yet.";
  }

  return [
    locale === "ko" ? "최근 거래 내역" : "Recent paper trades",
    ...trades.map((trade) =>
      [
        formatCompactTimestampForLocale(locale, trade.createdAt),
        `${trade.asset} ${trade.action}`,
        `${label(locale, "qty_short")} ${formatNumberForLocale(locale, trade.quantity, 8)}`,
        `${label(locale, "fill_short")} ${formatKrw(locale, trade.fillPrice)}`,
        `${label(locale, "realized_short")} ${formatSignedKrw(locale, trade.realizedPnl)}`,
      ].join(" | "),
    ),
    locale === "ko"
      ? "위 목록은 최근 체결 내역이며 누적 통계는 /pnl 에서 확인합니다."
      : "This list is recent history only. See /pnl for cumulative stats.",
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
    locale === "ko" ? `모의 체결: ${params.asset} ${params.action}` : `Paper execution: ${params.asset} ${params.action}`,
    `${label(locale, "fill")}: ${formatNumberForLocale(locale, params.quantity, 8)} @ ${formatKrw(locale, params.fillPrice)}`,
    `${label(locale, "realized")}: ${formatSignedKrw(locale, params.realizedPnl)}`,
    `${label(locale, "equity")}: ${formatKrw(locale, params.totalEquity)}`,
    `${label(locale, "return")}: ${formatPercent(locale, params.cumulativeReturnPct)}`,
    locale === "ko"
      ? "이 알림은 모의 체결 결과이며 실제 주문은 전송되지 않았습니다."
      : "This was a simulated paper fill. No real order was sent.",
  ].join("\n");
}

export function buildHourlySummaryMessage(params: {
  btcAction: string;
  ethAction: string;
  snapshot: PaperPerformanceSnapshot;
  locale: SupportedLocale;
}): string {
  const { locale, snapshot } = params;
  return [
    locale === "ko" ? "시간별 요약" : "Hourly summary",
    `BTC: ${params.btcAction} | ETH: ${params.ethAction}`,
    `${label(locale, "cash")}: ${formatKrw(locale, snapshot.account.cashBalance)}`,
    `${label(locale, "equity")}: ${formatKrw(locale, snapshot.totalEquity)}`,
    `${label(locale, "realized")}: ${formatSignedKrw(locale, snapshot.account.realizedPnl)}`,
    `${label(locale, "unrealized")}: ${formatSignedKrw(locale, snapshot.unrealizedPnl)}`,
    `${label(locale, "return")}: ${formatPercent(locale, snapshot.cumulativeReturnPct)}`,
    locale === "ko"
      ? "모든 값은 모의 체결 기준이며 실제 주문은 전송되지 않았습니다."
      : "All values reflect simulated paper fills. No real order was sent.",
  ].join("\n");
}

function renderCompactPositionLine(
  asset: SupportedAsset,
  snapshot: PaperPerformanceSnapshot,
  locale: SupportedLocale,
): string {
  const position = snapshot.positions[asset];
  const price = snapshot.latestPrices[asset];

  if (!position || position.quantity <= 0) {
    return `${asset}: ${locale === "ko" ? "보유 없음" : "flat"}`;
  }

  const unrealized = price === null ? 0 : (price - position.averageEntryPrice) * position.quantity;
  return `${asset}: ${formatNumberForLocale(locale, position.quantity, 8)} | avg ${formatKrw(locale, position.averageEntryPrice)} | uPnL ${formatSignedKrw(locale, unrealized)}`;
}

function renderDetailedPositionLine(
  asset: SupportedAsset,
  snapshot: PaperPerformanceSnapshot,
  locale: SupportedLocale,
): string {
  const position = snapshot.positions[asset];
  const price = snapshot.latestPrices[asset];

  if (!position || position.quantity <= 0) {
    return `${asset}: ${locale === "ko" ? "보유 없음" : "flat"}`;
  }

  const unrealized = price === null ? 0 : (price - position.averageEntryPrice) * position.quantity;
  return [
    `${asset}: ${label(locale, "qty_short")} ${formatNumberForLocale(locale, position.quantity, 8)}`,
    `${label(locale, "avg_short")} ${formatKrw(locale, position.averageEntryPrice)}`,
    `${label(locale, "mark_short")} ${price === null ? na(locale) : formatKrw(locale, price)}`,
    `${label(locale, "unrealized_short")} ${formatSignedKrw(locale, unrealized)}`,
  ].join(" | ");
}

function label(
  locale: SupportedLocale,
  key:
    | "cash"
    | "equity"
    | "realized"
    | "realized_trades"
    | "unrealized"
    | "return"
    | "closed_trades"
    | "win_rate"
    | "qty_short"
    | "fill_short"
    | "realized_short"
    | "fill"
    | "avg_short"
    | "mark_short"
    | "unrealized_short",
): string {
  const ko: Record<string, string> = {
    cash: "현금",
    equity: "현재 자산",
    realized: "실현 손익",
    realized_trades: "누적 실현 손익(체결기준)",
    unrealized: "미실현 손익",
    return: "누적 수익률",
    closed_trades: "누적 종료 거래 수",
    win_rate: "누적 승률",
    qty_short: "수량",
    fill_short: "체결",
    realized_short: "실현",
    fill: "모의 체결",
    avg_short: "평단",
    mark_short: "현재가",
    unrealized_short: "미실현",
  };
  const en: Record<string, string> = {
    cash: "Cash",
    equity: "Current equity",
    realized: "Realized PnL",
    realized_trades: "Cumulative realized PnL (closed trades)",
    unrealized: "Unrealized PnL",
    return: "Cumulative return",
    closed_trades: "Total closed trades",
    win_rate: "Cumulative closed-trade win rate",
    qty_short: "qty",
    fill_short: "fill",
    realized_short: "realized",
    fill: "Simulated fill",
    avg_short: "avg",
    mark_short: "mark",
    unrealized_short: "uPnL",
  };

  return (locale === "ko" ? ko : en)[key] ?? key;
}

function na(locale: SupportedLocale): string {
  return locale === "ko" ? "해당 없음" : "n/a";
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
