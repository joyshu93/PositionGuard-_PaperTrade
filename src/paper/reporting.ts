import type {
  DecisionExecutionDisposition,
  PaperDailySummary,
  PaperDecisionSnapshot,
  PaperPerformanceSnapshot,
  PaperTrade,
  PaperTradeAction,
  PaperTradingSettingsView,
  SignalQualityBucket,
  StrategyDecisionExecutionStatus,
  StrategyDecisionRecord,
  SupportedAsset,
  SupportedLocale,
} from "../domain/types.js";
import { formatCompactTimestampForLocale, formatNumberForLocale } from "../i18n/index.js";

export function getLocalizedPaperActionLabel(
  locale: SupportedLocale,
  action: PaperTradeAction,
): string {
  const ko: Record<PaperTradeAction, string> = {
    HOLD: "관망",
    ENTRY: "진입",
    ADD: "추가매수",
    REDUCE: "비중축소",
    EXIT: "청산",
  };
  const en: Record<PaperTradeAction, string> = {
    HOLD: "Hold",
    ENTRY: "Entry",
    ADD: "Add",
    REDUCE: "Reduce",
    EXIT: "Exit",
  };

  return (locale === "ko" ? ko : en)[action];
}

export function renderPaperStatusMessage(
  snapshot: PaperPerformanceSnapshot,
  locale: SupportedLocale,
): string {
  return [
    locale === "ko" ? "페이퍼 상태" : "Paper status",
    `${label(locale, "cash")}: ${formatKrw(locale, snapshot.account.cashBalance)}`,
    `${label(locale, "equity")}: ${formatKrw(locale, snapshot.totalEquity)}`,
    `${label(locale, "realized")}: ${formatSignedKrw(locale, snapshot.account.realizedPnl)}`,
    `${label(locale, "unrealized")}: ${formatSignedKrw(locale, snapshot.unrealizedPnl)}`,
    `${label(locale, "return")}: ${formatPercent(locale, snapshot.cumulativeReturnPct)}`,
    renderCompactPositionLine("BTC", snapshot, locale),
    renderCompactPositionLine("ETH", snapshot, locale),
    locale === "ko"
      ? "모든 체결은 내부 시뮬레이션 기준의 페이퍼 체결입니다."
      : "All fills are internal simulated paper fills.",
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
      ? "BTC/ETH 현물 페이퍼 포지션만 표시합니다."
      : "Showing BTC/ETH spot paper positions only.",
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
      ? "누적 통계는 저장된 전체 종료 매도 체결 이력 기준입니다."
      : "Cumulative stats are derived from the full persisted closed-trade history.",
  ].join("\n");
}

export function renderPaperHistoryMessage(
  trades: PaperTrade[],
  locale: SupportedLocale,
): string {
  if (trades.length === 0) {
    return locale === "ko"
      ? "최근 체결\n아직 시뮬레이션 체결이 없습니다."
      : "Recent paper trades\nNo simulated trades yet.";
  }

  return [
    locale === "ko" ? "최근 체결" : "Recent paper trades",
    ...trades.map((trade) =>
      [
        formatCompactTimestampForLocale(locale, trade.createdAt),
        `${trade.asset} ${getLocalizedPaperActionLabel(locale, trade.action)}`,
        `${label(locale, "qty_short")} ${formatNumberForLocale(locale, trade.quantity, 8)}`,
        `${label(locale, "fill_short")} ${formatKrw(locale, trade.fillPrice)}`,
        `${label(locale, "realized_short")} ${formatSignedKrw(locale, trade.realizedPnl)}`,
      ].join(" | "),
    ),
    locale === "ko"
      ? "여기는 최근 체결만 보여줍니다. 누적 통계는 /pnl에서 확인하세요."
      : "This view shows recent trades only. See /pnl for cumulative stats.",
  ].join("\n");
}

export function renderPaperSettingsMessage(
  settings: PaperTradingSettingsView,
  locale: SupportedLocale,
): string {
  const sourceLabel = (field: keyof PaperTradingSettingsView["values"]) =>
    settings.sourceByField[field] === "env"
      ? locale === "ko"
        ? "환경값"
        : "env override"
      : locale === "ko"
        ? "기본값"
        : "default";

  return [
    locale === "ko" ? "설정" : "Settings",
    locale === "ko" ? "적용 범위: 전역" : "Scope: global",
    `${locale === "ko" ? "초기 페이퍼 현금" : "Initial paper cash"}: ${formatKrw(locale, settings.values.initialPaperCashKrw)} (${sourceLabel("initialPaperCashKrw")})`,
    `${locale === "ko" ? "수수료율" : "Fee rate"}: ${formatDecimal(locale, settings.values.feeRate)} (${sourceLabel("feeRate")})`,
    `${locale === "ko" ? "슬리피지율" : "Slippage rate"}: ${formatDecimal(locale, settings.values.slippageRate)} (${sourceLabel("slippageRate")})`,
    `${locale === "ko" ? "최소 거래 금액" : "Minimum trade value"}: ${formatKrw(locale, settings.values.minimumTradeValueKrw)} (${sourceLabel("minimumTradeValueKrw")})`,
    `${locale === "ko" ? "진입 배분" : "Entry allocation"}: ${formatPercent(locale, settings.values.entryAllocation * 100)} (${sourceLabel("entryAllocation")})`,
    `${locale === "ko" ? "추가매수 배분" : "Add allocation"}: ${formatPercent(locale, settings.values.addAllocation * 100)} (${sourceLabel("addAllocation")})`,
    `${locale === "ko" ? "축소 비중" : "Reduce fraction"}: ${formatPercent(locale, settings.values.reduceFraction * 100)} (${sourceLabel("reduceFraction")})`,
    `${locale === "ko" ? "자산별 최대 비중" : "Per-asset max allocation"}: ${formatPercent(locale, settings.values.perAssetMaxAllocation * 100)} (${sourceLabel("perAssetMaxAllocation")})`,
    `${locale === "ko" ? "총 최대 익스포저" : "Total portfolio max exposure"}: ${formatPercent(locale, settings.values.totalPortfolioMaxExposure * 100)} (${sourceLabel("totalPortfolioMaxExposure")})`,
  ].join("\n");
}

export function renderPaperDecisionMessage(
  snapshot: PaperDecisionSnapshot,
  locale: SupportedLocale,
): string {
  return [
    locale === "ko" ? "최근 결정" : "Latest decisions",
    renderDecisionLine("BTC", snapshot.latestByAsset.BTC, locale),
    renderDecisionLine("ETH", snapshot.latestByAsset.ETH, locale),
  ].join("\n");
}

export function renderPaperDailyMessage(
  summary: PaperDailySummary,
  locale: SupportedLocale,
): string {
  return [
    locale === "ko" ? `일간 요약 (${summary.dayLabel})` : `Daily summary (${summary.dayLabel})`,
    `${locale === "ko" ? "오늘 체결 수" : "Simulated trades today"}: ${formatNumberForLocale(locale, summary.tradeCount, 0)}`,
    `${locale === "ko" ? "오늘 실현 손익" : "Realized PnL today"}: ${formatSignedKrw(locale, summary.realizedPnl)}`,
    `${locale === "ko" ? "현재 총자산" : "Current total equity"}: ${formatKrw(locale, summary.currentTotalEquity)}`,
    `${locale === "ko" ? "BTC 액션 수" : "BTC action counts"}: ${renderActionCounts(summary.actionCounts.BTC, locale)}`,
    `${locale === "ko" ? "ETH 액션 수" : "ETH action counts"}: ${renderActionCounts(summary.actionCounts.ETH, locale)}`,
    locale === "ko"
      ? "기준 시간대: Asia/Seoul (KST)"
      : "Timezone basis: Asia/Seoul (KST)",
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
    locale === "ko"
      ? `모의 체결: ${params.asset} ${getLocalizedPaperActionLabel(locale, params.action)}`
      : `Paper execution: ${params.asset} ${getLocalizedPaperActionLabel(locale, params.action)}`,
    `${label(locale, "fill")}: ${formatNumberForLocale(locale, params.quantity, 8)} @ ${formatKrw(locale, params.fillPrice)}`,
    `${label(locale, "realized")}: ${formatSignedKrw(locale, params.realizedPnl)}`,
    `${label(locale, "equity")}: ${formatKrw(locale, params.totalEquity)}`,
    `${label(locale, "return")}: ${formatPercent(locale, params.cumulativeReturnPct)}`,
    locale === "ko"
      ? "실거래 주문은 전송되지 않았고, 내부 시뮬레이션 페이퍼 체결입니다."
      : "No real order was sent. This was an internal simulated paper fill.",
  ].join("\n");
}

export function buildHourlySummaryMessage(params: {
  btcAction: PaperTradeAction;
  ethAction: PaperTradeAction;
  snapshot: PaperPerformanceSnapshot;
  locale: SupportedLocale;
}): string {
  const { locale, snapshot } = params;
  return [
    locale === "ko" ? "시간별 요약" : "Hourly summary",
    `BTC: ${getLocalizedPaperActionLabel(locale, params.btcAction)} | ETH: ${getLocalizedPaperActionLabel(locale, params.ethAction)}`,
    `${label(locale, "cash")}: ${formatKrw(locale, snapshot.account.cashBalance)}`,
    `${label(locale, "equity")}: ${formatKrw(locale, snapshot.totalEquity)}`,
    `${label(locale, "realized")}: ${formatSignedKrw(locale, snapshot.account.realizedPnl)}`,
    `${label(locale, "unrealized")}: ${formatSignedKrw(locale, snapshot.unrealizedPnl)}`,
    `${label(locale, "return")}: ${formatPercent(locale, snapshot.cumulativeReturnPct)}`,
    locale === "ko"
      ? "모든 수치는 내부 시뮬레이션 페이퍼 체결 기준입니다."
      : "All values reflect internal simulated paper fills.",
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

function renderDecisionLine(
  asset: SupportedAsset,
  decision: StrategyDecisionRecord | null,
  locale: SupportedLocale,
): string {
  if (!decision) {
    return locale === "ko"
      ? `${asset}: 아직 저장된 결정이 없습니다.`
      : `${asset}: No persisted decision yet.`;
  }

  const meta = readDecisionMeta(decision.rationale);
  const reasons = decision.reasons.slice(0, 2).join(" / ");

  return [
    `${asset}: ${getLocalizedPaperActionLabel(locale, decision.action)} | ${getDispositionLabel(locale, meta.executionDisposition, decision.executionStatus)}`,
    `${locale === "ko" ? "신호 강도" : "Signal quality"}: ${getQualityBucketLabel(locale, meta.signalQualityBucket)}`,
    decision.summary,
    `${locale === "ko" ? "사유" : "Reasons"}: ${reasons || na(locale)}`,
    `${locale === "ko" ? "기준가" : "Reference"}: ${decision.referencePrice > 0 ? formatKrw(locale, decision.referencePrice) : na(locale)}`,
    `${locale === "ko" ? "시각" : "At"}: ${formatCompactTimestampForLocale(locale, decision.createdAt)}`,
  ].join("\n");
}

function renderActionCounts(
  counts: Partial<Record<PaperTradeAction, number>>,
  locale: SupportedLocale,
): string {
  const ordered: PaperTradeAction[] = ["ENTRY", "ADD", "REDUCE", "EXIT", "HOLD"];
  const parts = ordered
    .filter((action) => (counts[action] ?? 0) > 0)
    .map(
      (action) =>
        `${getLocalizedPaperActionLabel(locale, action)} ${formatNumberForLocale(locale, counts[action] ?? 0, 0)}`,
    );

  return parts.length > 0 ? parts.join(" / ") : locale === "ko" ? "없음" : "none";
}

function readDecisionMeta(rationale: unknown): {
  executionDisposition: DecisionExecutionDisposition;
  signalQualityBucket: SignalQualityBucket | null;
} {
  if (!rationale || typeof rationale !== "object") {
    return {
      executionDisposition: "SKIPPED",
      signalQualityBucket: null,
    };
  }

  const value = rationale as Record<string, unknown>;
  const signalQuality =
    value.signalQuality && typeof value.signalQuality === "object"
      ? (value.signalQuality as Record<string, unknown>)
      : null;

  return {
    executionDisposition:
      typeof value.executionDisposition === "string"
        ? (value.executionDisposition as DecisionExecutionDisposition)
        : "SKIPPED",
    signalQualityBucket:
      signalQuality && typeof signalQuality.bucket === "string"
        ? (signalQuality.bucket as SignalQualityBucket)
        : null,
  };
}

function getDispositionLabel(
  locale: SupportedLocale,
  disposition: DecisionExecutionDisposition,
  executionStatus: StrategyDecisionExecutionStatus,
): string {
  if (locale === "ko") {
    if (disposition === "DEFERRED_CONFIRMATION") return "확인 대기";
    if (disposition === "EXECUTED_AFTER_CONFIRMATION") return "확인 후 실행";
    if (disposition === "IMMEDIATE" && executionStatus === "EXECUTED") return "즉시 실행";
    return executionStatus === "EXECUTED" ? "실행됨" : "건너뜀";
  }

  if (disposition === "DEFERRED_CONFIRMATION") return "Deferred";
  if (disposition === "EXECUTED_AFTER_CONFIRMATION") return "Executed after confirmation";
  if (disposition === "IMMEDIATE" && executionStatus === "EXECUTED") return "Immediate";
  return executionStatus === "EXECUTED" ? "Executed" : "Skipped";
}

function getQualityBucketLabel(
  locale: SupportedLocale,
  bucket: SignalQualityBucket | null,
): string {
  if (bucket === null) {
    return na(locale);
  }

  const ko: Record<SignalQualityBucket, string> = {
    HIGH: "높음",
    MEDIUM: "보통",
    BORDERLINE: "경계",
    LOW: "낮음",
  };
  const en: Record<SignalQualityBucket, string> = {
    HIGH: "High",
    MEDIUM: "Medium",
    BORDERLINE: "Borderline",
    LOW: "Low",
  };

  return (locale === "ko" ? ko : en)[bucket];
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
    equity: "현재 총자산",
    realized: "실현 손익",
    realized_trades: "누적 실현 손익(종료 거래 기준)",
    unrealized: "미실현 손익",
    return: "누적 수익률",
    closed_trades: "누적 종료 거래 수",
    win_rate: "누적 종료 거래 승률",
    qty_short: "수량",
    fill_short: "체결가",
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
  return locale === "ko" ? "없음" : "n/a";
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

function formatDecimal(locale: SupportedLocale, value: number): string {
  return formatNumberForLocale(locale, value, 4);
}
