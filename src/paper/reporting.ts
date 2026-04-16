import type {
  DecisionExecutionDisposition,
  EntryPath,
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
  WeakeningStage,
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
  queriedAt?: string | null,
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
    queriedAt ? getQueryTimeLine(locale, queriedAt) : null,
    locale === "ko"
      ? "현재가와 미실현 손익은 조회 시점 Upbit 공개 티커를 우선 사용합니다."
      : "Current prices and unrealized values prefer query-time public Upbit tickers.",
    locale === "ko"
      ? "모든 체결은 내부 시뮬레이션 기준의 페이퍼 체결입니다."
      : "All fills are internal simulated paper fills.",
  ].filter((value): value is string => Boolean(value)).join("\n");
}

export function renderPaperPositionsMessage(
  snapshot: PaperPerformanceSnapshot,
  locale: SupportedLocale,
  queriedAt?: string | null,
): string {
  return [
    locale === "ko" ? "포지션" : "Positions",
    renderDetailedPositionLine("BTC", snapshot, locale),
    renderDetailedPositionLine("ETH", snapshot, locale),
    queriedAt ? getQueryTimeLine(locale, queriedAt) : null,
    locale === "ko"
      ? "현재가는 조회 시점 Upbit 공개 티커 기준이며, 실패 시 최근 저장 mark로 대체합니다."
      : "Current marks use query-time public Upbit tickers and fall back to the latest persisted marks if unavailable.",
    locale === "ko"
      ? "BTC/ETH 현물 페이퍼 포지션만 표시합니다."
      : "Showing BTC/ETH spot paper positions only.",
  ].filter((value): value is string => Boolean(value)).join("\n");
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
      ? "이 화면은 손익과 누적 성과를 저장된 페이퍼트레이딩 상태 기준으로 보여줍니다."
      : "This view reflects persisted paper-trading state for PnL and cumulative performance.",
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
  const sourceSummary = summarizeSettingsSource(locale, settings);

  if (locale === "ko") {
    return [
      "설정",
      "적용 범위: 전역",
      "",
      "거래소 기준 참고값",
      `수수료율: ${formatDecimal(locale, settings.values.feeRate)} (${fieldSourceLabel(locale, settings, "feeRate")})`,
      `최소 거래 금액: ${formatKrw(locale, settings.values.minimumTradeValueKrw)} (${fieldSourceLabel(locale, settings, "minimumTradeValueKrw")})`,
      "참고: Upbit KRW 현물 기준을 참고한 값이며 거래소와 실시간 동기화되지는 않습니다.",
      "",
      "내부 시뮬레이션 및 전략 설정",
      `초기 페이퍼 현금: ${formatKrw(locale, settings.values.initialPaperCashKrw)} (${fieldSourceLabel(locale, settings, "initialPaperCashKrw")})`,
      `슬리피지율: ${formatDecimal(locale, settings.values.slippageRate)} (${fieldSourceLabel(locale, settings, "slippageRate")})`,
      `진입 배분: ${formatPercent(locale, settings.values.entryAllocation * 100)} (${fieldSourceLabel(locale, settings, "entryAllocation")})`,
      `추가매수 배분: ${formatPercent(locale, settings.values.addAllocation * 100)} (${fieldSourceLabel(locale, settings, "addAllocation")})`,
      `축소 비중: ${formatPercent(locale, settings.values.reduceFraction * 100)} (${fieldSourceLabel(locale, settings, "reduceFraction")})`,
      `자산별 최대 비중: ${formatPercent(locale, settings.values.perAssetMaxAllocation * 100)} (${fieldSourceLabel(locale, settings, "perAssetMaxAllocation")})`,
      `총 최대 익스포저: ${formatPercent(locale, settings.values.totalPortfolioMaxExposure * 100)} (${fieldSourceLabel(locale, settings, "totalPortfolioMaxExposure")})`,
      "참고: 슬리피지, 배분, 익스포저 값은 거래소 정책이 아니라 내부 페이퍼트레이딩 가정입니다.",
      "",
      `출처 요약: ${sourceSummary}`,
    ].join("\n");
  }

  return [
    "Settings",
    "Scope: global",
    "",
    "Exchange-referenced assumptions",
    `Fee rate: ${formatDecimal(locale, settings.values.feeRate)} (${fieldSourceLabel(locale, settings, "feeRate")})`,
    `Minimum trade value: ${formatKrw(locale, settings.values.minimumTradeValueKrw)} (${fieldSourceLabel(locale, settings, "minimumTradeValueKrw")})`,
    "Note: These reference current Upbit KRW spot assumptions, but they are not live-synced from the exchange.",
    "",
    "Internal simulation and strategy settings",
    `Initial paper cash: ${formatKrw(locale, settings.values.initialPaperCashKrw)} (${fieldSourceLabel(locale, settings, "initialPaperCashKrw")})`,
    `Slippage rate: ${formatDecimal(locale, settings.values.slippageRate)} (${fieldSourceLabel(locale, settings, "slippageRate")})`,
    `Entry allocation: ${formatPercent(locale, settings.values.entryAllocation * 100)} (${fieldSourceLabel(locale, settings, "entryAllocation")})`,
    `Add allocation: ${formatPercent(locale, settings.values.addAllocation * 100)} (${fieldSourceLabel(locale, settings, "addAllocation")})`,
    `Reduce fraction: ${formatPercent(locale, settings.values.reduceFraction * 100)} (${fieldSourceLabel(locale, settings, "reduceFraction")})`,
    `Per-asset max allocation: ${formatPercent(locale, settings.values.perAssetMaxAllocation * 100)} (${fieldSourceLabel(locale, settings, "perAssetMaxAllocation")})`,
    `Total portfolio max exposure: ${formatPercent(locale, settings.values.totalPortfolioMaxExposure * 100)} (${fieldSourceLabel(locale, settings, "totalPortfolioMaxExposure")})`,
    "Note: Slippage, staged sizing, and exposure values are internal paper-trading assumptions, not exchange policy values.",
    "",
    `Source summary: ${sourceSummary}`,
  ].join("\n");
}

export function renderPaperDecisionMessage(
  snapshot: PaperDecisionSnapshot,
  locale: SupportedLocale,
): string {
  return [
    locale === "ko" ? "최근 결정" : "Latest decisions",
    renderDecisionLineCompact("BTC", snapshot.latestByAsset.BTC, locale),
    renderDecisionLineCompact("ETH", snapshot.latestByAsset.ETH, locale),
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
    locale === "ko" ? "기준 시간대: Asia/Seoul (KST)" : "Timezone basis: Asia/Seoul (KST)",
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
  btcDisposition: DecisionExecutionDisposition;
  ethAction: PaperTradeAction;
  ethDisposition: DecisionExecutionDisposition;
  snapshot: PaperPerformanceSnapshot;
  locale: SupportedLocale;
}): string {
  const { locale, snapshot } = params;
  return [
    locale === "ko" ? "시간별 요약" : "Hourly summary",
    `BTC: ${getSummaryActionLabel(locale, params.btcAction, params.btcDisposition)} | ETH: ${getSummaryActionLabel(locale, params.ethAction, params.ethDisposition)}`,
    `${label(locale, "cash")}: ${formatKrw(locale, snapshot.account.cashBalance)}`,
    `${label(locale, "equity")}: ${formatKrw(locale, snapshot.totalEquity)}`,
    `${label(locale, "realized")}: ${formatSignedKrw(locale, snapshot.account.realizedPnl)}`,
    `${label(locale, "unrealized")}: ${formatSignedKrw(locale, snapshot.unrealizedPnl)}`,
    `${label(locale, "return")}: ${formatPercent(locale, snapshot.cumulativeReturnPct)}`,
    locale === "ko"
      ? "모든 수치는 내부 시뮬레이션 기준입니다."
      : "All values reflect internal simulation.",
  ].join("\n");
}

function getSummaryActionLabel(
  locale: SupportedLocale,
  action: PaperTradeAction,
  disposition: DecisionExecutionDisposition,
): string {
  const actionLabel = getLocalizedPaperActionLabel(locale, action);

  if (action === "HOLD") {
    return actionLabel;
  }

  const suffix =
    disposition === "DEFERRED_CONFIRMATION"
      ? locale === "ko"
        ? "확인 대기"
        : "pending confirmation"
      : disposition === "EXECUTED_AFTER_CONFIRMATION"
        ? locale === "ko"
          ? "확인 후 실행"
          : "executed after confirmation"
        : disposition === "IMMEDIATE"
          ? locale === "ko"
            ? "실행"
            : "executed"
          : locale === "ko"
            ? "스킵"
            : "skipped";

  return `${actionLabel} (${suffix})`;
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
  return [
    `${asset}: ${formatNumberForLocale(locale, position.quantity, 8)}`,
    `${label(locale, "avg_short")} ${formatKrw(locale, position.averageEntryPrice)}`,
    `${label(locale, "unrealized_short")} ${formatSignedKrw(locale, unrealized)}`,
  ].join(" | ");
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
  const localizedReasons = decision.reasons.slice(0, 2).map((reason) => localizeDecisionText(locale, reason));
  const localizedSummary = localizeDecisionText(locale, decision.summary);
  const detailLine = [
    `${locale === "ko" ? "경로" : "Path"}: ${getEntryPathLabel(locale, meta.entryPath)}`,
    `${locale === "ko" ? "추세 정렬" : "Trend"} ${formatScore(meta.trendAlignmentScore, 5)}`,
    `${locale === "ko" ? "회복 품질" : "Recovery"} ${formatScore(meta.recoveryQualityScore)}`,
    `${locale === "ko" ? "하락 압력" : "Pressure"} ${getPressureLabel(locale, meta.breakdownPressureScore)}`,
  ].join(" | ");

  return [
    `${asset}: ${getLocalizedPaperActionLabel(locale, decision.action)} | ${getCompactDispositionLabel(locale, meta.executionDisposition, decision.executionStatus)}`,
    `${locale === "ko" ? "신호 강도" : "Signal quality"}: ${getQualityBucketLabel(locale, meta.signalQualityBucket)}`,
    detailLine,
    meta.weakeningStage !== "NONE"
      ? `${locale === "ko" ? "약화 단계" : "Weakening"}: ${getWeakeningStageLabel(locale, meta.weakeningStage)}`
      : null,
    localizedSummary,
    `${locale === "ko" ? "사유" : "Reasons"}: ${(localizedReasons.join(" / ")) || na(locale)}`,
    `${locale === "ko" ? "기준가" : "Reference"}: ${decision.referencePrice > 0 ? formatKrw(locale, decision.referencePrice) : na(locale)}`,
    `${locale === "ko" ? "시각" : "At"}: ${formatCompactTimestampForLocale(locale, decision.createdAt)}`,
  ].filter((value): value is string => Boolean(value)).join("\n");
}

function renderDecisionLineCompact(
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
  const localizedReasons = decision.reasons.slice(0, 2).map((reason) => localizeDecisionText(locale, reason));
  const localizedSummary = localizeDecisionText(locale, decision.summary);

  return [
    `${asset}: ${getLocalizedPaperActionLabel(locale, decision.action)} | ${getCompactDispositionLabel(locale, meta.executionDisposition, decision.executionStatus)}`,
    meta.entryPath !== "NONE"
      ? `${locale === "ko" ? "경로" : "Path"}: ${getEntryPathLabel(locale, meta.entryPath)}`
      : null,
    meta.weakeningStage !== "NONE"
      ? `${locale === "ko" ? "약화 단계" : "Weakening"}: ${getWeakeningStageLabel(locale, meta.weakeningStage)}`
      : null,
    `${locale === "ko" ? "설명" : "Summary"}: ${localizedSummary}`,
    `${locale === "ko" ? "사유" : "Reasons"}: ${(localizedReasons.join(" / ")) || na(locale)}`,
    `${locale === "ko" ? "기준가" : "Reference"}: ${decision.referencePrice > 0 ? formatKrw(locale, decision.referencePrice) : na(locale)}`,
    `${locale === "ko" ? "시각" : "At"}: ${formatCompactTimestampForLocale(locale, decision.createdAt)}`,
  ].filter((value): value is string => Boolean(value)).join("\n");
}

function getCompactDispositionLabel(
  locale: SupportedLocale,
  disposition: DecisionExecutionDisposition,
  executionStatus: StrategyDecisionExecutionStatus,
): string {
  if (locale === "ko") {
    if (disposition === "DEFERRED_CONFIRMATION") return "확인 대기";
    if (disposition === "EXECUTED_AFTER_CONFIRMATION") return "확인 후 실행";
    return executionStatus === "EXECUTED" ? "실행" : "건너뜀";
  }

  if (disposition === "DEFERRED_CONFIRMATION") return "Pending confirmation";
  if (disposition === "EXECUTED_AFTER_CONFIRMATION") return "Executed after confirmation";
  return executionStatus === "EXECUTED" ? "Executed" : "Skipped";
}

function localizeDecisionText(locale: SupportedLocale, text: string): string {
  if (locale !== "ko") {
    return text;
  }

  const exactMap: Record<string, string> = {
    "Higher-timeframe support has broken or invalidation is already broken.": "상위 타임프레임 지지가 깨졌거나 invalidation이 이미 무너졌습니다.",
    "Invalidation-first exit remains immediate and unchanged.": "invalidation 우선 청산은 지연 없이 즉시 유지됩니다.",
    "Constructive structure is strong enough to act immediately.": "구조적 강세 품질이 충분해 즉시 대응할 수 있습니다.",
    "Bullish structure is valid but borderline, so one additional hourly confirmation is required.": "강세 구조는 유효하지만 경계 구간이라 한 시간 추가 확인이 필요합니다.",
    "Borderline bullish structure held for one additional hourly confirmation.": "경계 구간 강세 구조가 한 시간 추가 확인을 버텼습니다.",
    "Exposure guardrails leave no room for additional risk right now.": "현재 익스포저 가드레일상 추가 위험을 더할 여유가 없습니다.",
    "Price is too extended for a no-chase entry.": "추격매수를 피하기엔 가격이 너무 많이 확장됐습니다.",
    "Bullish structure is not strong enough to justify a fresh entry.": "새 진입을 정당화할 만큼 강세 구조가 충분히 강하지 않습니다.",
    "Recent exit caution slightly raised the entry threshold and the recovery quality is not strong enough yet.": "최근 청산 경계로 진입 기준이 약간 높아졌고, 아직 회복 품질이 충분하지 않습니다.",
    "Bullish score did not clear the entry hysteresis threshold.": "강세 점수가 진입 hysteresis 기준을 넘지 못했습니다.",
    "Existing position is still valid, but mild weakening means add quality is not strong enough yet.": "기존 포지션은 아직 유효하지만 약한 약화가 있어 추가매수 품질이 아직 충분하지 않습니다.",
    "Existing position remains valid, but add quality needs stronger trend alignment and recovery structure.": "기존 포지션은 유효하지만 추가매수에는 더 강한 추세 정렬과 회복 구조가 필요합니다.",
    "Exposure guardrails leave no room for an additional add.": "익스포저 가드레일상 추가매수를 더할 여유가 없습니다.",
    "Constructive add quality is strong enough for an immediate staged add.": "구조적 추가매수 품질이 충분해 즉시 분할 추가매수가 가능합니다.",
    "Borderline add setup stayed constructive for one more hourly confirmation.": "경계 구간 추가매수 셋업이 한 시간 더 건설적으로 유지됐습니다.",
    "Add setup is valid but borderline, so execution is deferred pending one more hourly confirmation.": "추가매수 셋업은 유효하지만 경계 구간이라 한 시간 추가 확인 후 실행합니다.",
    "Existing hold remains valid, but add quality did not clear the stricter add threshold.": "기존 보유는 유효하지만 추가매수 품질이 더 엄격한 add 기준을 넘지 못했습니다.",
    "Weakening is still soft, so any reduction stays modest and mainly protects open gains.": "약화는 아직 초기 단계라 감축은 작게 가져가며 열린 수익 보호가 우선입니다.",
    "Multiple weakness signals are aligned, so a staged reduction is justified.": "여러 약세 신호가 정렬돼 있어 분할 감축이 정당화됩니다.",
    "Weakness is present, but reduction remains staged rather than full exit.": "약화는 있지만 전량 청산보다는 단계적 감축으로 대응합니다.",
    "Weakening has become clear enough that a larger staged reduction is now justified.": "약화가 충분히 명확해져 더 큰 단계적 감축이 정당화됩니다.",
    "Weakening evidence cleared the reduce hysteresis threshold.": "약화 증거가 reduce hysteresis 기준을 넘었습니다.",
    "Reclaim structure is intact.": "리클레임 구조가 유지되고 있습니다.",
    "Breakout-hold structure is intact.": "돌파 후 지지 구조가 유지되고 있습니다.",
    "Constructive pullback structure is available.": "건설적인 눌림 구조가 형성돼 있습니다.",
    "No constructive entry path is active.": "활성화된 건설적 진입 경로가 없습니다.",
    "Recent exit caution slightly raised the re-entry threshold, but the current structure still cleared it.": "최근 청산 경계로 재진입 기준이 약간 높아졌지만 현재 구조는 이를 여전히 통과했습니다.",
    "No recent-exit caution is suppressing the setup.": "최근 청산 경계가 현재 셋업을 누르고 있지 않습니다.",
    "Reclaim paths can add faster than raw pullbacks, but only when continuation quality stays healthy.": "리클레임 경로는 단순 눌림보다 빠르게 추가매수할 수 있지만, 이어지는 품질이 건강할 때만 허용됩니다.",
    "Reclaim paths can clear a slightly faster threshold when recovery quality is already convincing.": "리클레임 경로는 회복 품질이 충분히 설득력 있을 때 조금 더 빠른 기준을 통과할 수 있습니다.",
    "Breakout-hold paths require stronger confirmation so continuation entries do not turn into chase buying.": "돌파 후 지지 경로는 추격매수가 되지 않도록 더 강한 확인을 요구합니다.",
    "Pullback adds stay stricter than fresh entries, especially when the pullback is not clearly lower in the range.": "눌림 추가매수는 신규 진입보다 더 엄격하며, 특히 눌림이 범위 하단이 아닐수록 더 그렇습니다.",
    "Pullback entries still need a constructive lower-range structure or clear recovery support.": "눌림 진입도 하단 구조의 건설성이나 명확한 회복 지지가 필요합니다.",
  };

  const summaryMap: Array<[RegExp, string]> = [
    [/^(BTC|ETH) paper exit is required because invalidation has failed\.$/, "$1 청산이 필요합니다. invalidation이 무너졌습니다."],
    [/^(BTC|ETH) entry setup is deferred pending one additional hourly confirmation\.$/, "$1 진입 셋업은 한 시간 추가 확인을 위해 보류되었습니다."],
    [/^(BTC|ETH) add setup is deferred pending one additional hourly confirmation\.$/, "$1 추가매수 셋업은 한 시간 추가 확인을 위해 보류되었습니다."],
    [/^(BTC|ETH) paper entry is allowed by constructive structure\.$/, "$1 진입이 허용됩니다. 건설적인 구조가 확인됐습니다."],
    [/^(BTC|ETH) paper add is allowed by constructive structure\.$/, "$1 추가매수가 허용됩니다. 건설적인 구조가 확인됐습니다."],
    [/^(BTC|ETH) paper reduction is allowed because weakening is now sufficiently clear\.$/, "$1 비중축소가 허용됩니다. 약화가 충분히 명확해졌습니다."],
    [/^(BTC|ETH) stays on hold while the existing paper position remains valid\.$/, "$1는 관망입니다. 기존 페이퍼 포지션이 아직 유효합니다."],
    [/^(BTC|ETH) stays on hold because entry quality is not strong enough yet\.$/, "$1는 관망입니다. 아직 진입 품질이 충분히 강하지 않습니다."],
  ];

  const regimeMatch = text.match(/^Regime is ([A-Z_]+)\.$/);
  if (regimeMatch) {
    return `레짐: ${regimeMatch[1]}.`;
  }

  const weakeningMatch = text.match(/^Weakening stage is ([A-Z_]+)\.$/);
  if (weakeningMatch) {
    return `약화 단계: ${weakeningMatch[1]}.`;
  }

  for (const [pattern, replacement] of summaryMap) {
    if (pattern.test(text)) {
      return text.replace(pattern, replacement);
    }
  }

  return exactMap[text] ?? text;
}

function renderActionCounts(
  counts: Partial<Record<PaperTradeAction, number>>,
  locale: SupportedLocale,
): string {
  const ordered: PaperTradeAction[] = ["ENTRY", "ADD", "REDUCE", "EXIT", "HOLD"];
  const parts = ordered
    .filter((action) => (counts[action] ?? 0) > 0)
    .map((action) => `${getLocalizedPaperActionLabel(locale, action)} ${formatNumberForLocale(locale, counts[action] ?? 0, 0)}`);

  return parts.length > 0 ? parts.join(" / ") : locale === "ko" ? "없음" : "none";
}

function readDecisionMeta(rationale: unknown): {
  executionDisposition: DecisionExecutionDisposition;
  signalQualityBucket: SignalQualityBucket | null;
  entryPath: EntryPath;
  trendAlignmentScore: number | null;
  recoveryQualityScore: number | null;
  breakdownPressureScore: number | null;
  weakeningStage: WeakeningStage;
} {
  if (!rationale || typeof rationale !== "object") {
    return {
      executionDisposition: "SKIPPED",
      signalQualityBucket: null,
      entryPath: "NONE",
      trendAlignmentScore: null,
      recoveryQualityScore: null,
      breakdownPressureScore: null,
      weakeningStage: "NONE",
    };
  }

  const value = rationale as Record<string, unknown>;
  const signalQuality =
    value.signalQuality && typeof value.signalQuality === "object"
      ? (value.signalQuality as Record<string, unknown>)
      : null;
  const diagnostics =
    value.diagnostics && typeof value.diagnostics === "object"
      ? (value.diagnostics as Record<string, unknown>)
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
    entryPath:
      diagnostics && typeof diagnostics.entryPath === "string"
        ? (diagnostics.entryPath as EntryPath)
        : "NONE",
    trendAlignmentScore:
      diagnostics && typeof diagnostics.trendAlignmentScore === "number"
        ? diagnostics.trendAlignmentScore
        : null,
    recoveryQualityScore:
      diagnostics && typeof diagnostics.recoveryQualityScore === "number"
        ? diagnostics.recoveryQualityScore
        : null,
    breakdownPressureScore:
      diagnostics && typeof diagnostics.breakdownPressureScore === "number"
        ? diagnostics.breakdownPressureScore
        : null,
    weakeningStage:
      diagnostics && typeof diagnostics.weakeningStage === "string"
        ? (diagnostics.weakeningStage as WeakeningStage)
        : "NONE",
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

function getEntryPathLabel(locale: SupportedLocale, entryPath: EntryPath): string {
  const ko: Record<EntryPath, string> = {
    PULLBACK: "눌림",
    RECLAIM: "리클레임",
    BREAKOUT_HOLD: "돌파 후 지지",
    NONE: "없음",
  };
  const en: Record<EntryPath, string> = {
    PULLBACK: "Pullback",
    RECLAIM: "Reclaim",
    BREAKOUT_HOLD: "Breakout-hold",
    NONE: "None",
  };

  return (locale === "ko" ? ko : en)[entryPath];
}

function getPressureLabel(locale: SupportedLocale, score: number | null): string {
  if (score === null) {
    return na(locale);
  }

  if (locale === "ko") {
    if (score >= 4) return `높음(${score})`;
    if (score >= 2) return `보통(${score})`;
    return `낮음(${score})`;
  }

  if (score >= 4) return `High (${score})`;
  if (score >= 2) return `Medium (${score})`;
  return `Low (${score})`;
}

function getWeakeningStageLabel(locale: SupportedLocale, stage: WeakeningStage): string {
  const ko: Record<WeakeningStage, string> = {
    NONE: "없음",
    SOFT: "초기 약화",
    CLEAR: "명확한 약화",
    FAILURE: "실패",
  };
  const en: Record<WeakeningStage, string> = {
    NONE: "None",
    SOFT: "Soft weakening",
    CLEAR: "Clear weakening",
    FAILURE: "Failure",
  };

  return (locale === "ko" ? ko : en)[stage];
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

function fieldSourceLabel(
  locale: SupportedLocale,
  settings: PaperTradingSettingsView,
  field: keyof PaperTradingSettingsView["values"],
): string {
  const source = settings.sourceByField[field];
  if (locale === "ko") {
    return source === "env" ? "환경값" : "코드 기본값";
  }

  return source === "env" ? "env override" : "code default";
}

function summarizeSettingsSource(
  locale: SupportedLocale,
  settings: PaperTradingSettingsView,
): string {
  const envOverrides = Object.values(settings.sourceByField).filter((value) => value === "env").length;
  if (envOverrides === 0) {
    return locale === "ko"
      ? "현재 모든 값은 코드 기본 설정에서 왔습니다."
      : "All active values currently come from code defaults.";
  }

  return locale === "ko"
    ? `현재 ${envOverrides}개 항목이 환경값으로 덮어써져 있습니다.`
    : `${envOverrides} field(s) currently come from environment overrides.`;
}

function getQueryTimeLine(locale: SupportedLocale, queriedAt: string): string {
  return locale === "ko"
    ? `조회 시각: ${formatCompactTimestampForLocale(locale, queriedAt)}`
    : `Queried at: ${formatCompactTimestampForLocale(locale, queriedAt)}`;
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

function formatScore(score: number | null, max = 6): string {
  return score === null ? "-" : `${score}/${max}`;
}
