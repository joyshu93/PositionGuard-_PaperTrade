export type SupportedAsset = "BTC" | "ETH";
export type SupportedMarket = "KRW-BTC" | "KRW-ETH";
export type SupportedTimeframe = "1h" | "4h" | "1d";
export type TrackedAssetPreference = "BTC" | "ETH" | "BTC,ETH";
export type SupportedLocale = "ko" | "en";

export interface User {
  id: number;
  telegramUserId: string;
  telegramChatId: string | null;
  username: string | null;
  displayName: string | null;
  locale?: SupportedLocale | null;
  trackedAssets: TrackedAssetPreference;
  sleepModeEnabled: boolean;
  onboardingComplete: boolean;
  nextPaperStartCash: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountState {
  id: number;
  userId: number;
  availableCash: number;
  reportedAt: string;
  source: "USER_REPORTED";
  createdAt: string;
  updatedAt: string;
}

export interface PositionState {
  id: number;
  userId: number;
  asset: SupportedAsset;
  quantity: number;
  averageEntryPrice: number;
  reportedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketTicker {
  market: SupportedMarket;
  tradePrice: number;
  changeRate: number;
  tradeTimeKst: string | null;
  tradeTimeUtc: string | null;
  exchangeTimestampMs: number | null;
  fetchedAt: string;
}

export interface MarketCandle {
  market: SupportedMarket;
  timeframe: SupportedTimeframe;
  openTime: string;
  closeTime: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  quoteVolume: number;
}

export interface TimeframeMarketSnapshot {
  timeframe: SupportedTimeframe;
  candles: MarketCandle[];
}

export interface MarketSnapshot {
  market: SupportedMarket;
  asset: SupportedAsset;
  ticker: MarketTicker;
  timeframes: Record<SupportedTimeframe, TimeframeMarketSnapshot>;
  fetchedAt: string;
}

export interface DecisionContext {
  user: Pick<
    User,
    | "id"
    | "telegramUserId"
    | "telegramChatId"
    | "username"
    | "displayName"
    | "locale"
    | "trackedAssets"
    | "sleepModeEnabled"
    | "onboardingComplete"
  >;
  setup: {
    trackedAssets: SupportedAsset[];
    hasAccountState: boolean;
    readyPositionAssets: SupportedAsset[];
    isReady: boolean;
    missingItems: string[];
  };
  accountState: AccountState | null;
  positionState: PositionState | null;
  marketSnapshot: MarketSnapshot | null;
  generatedAt: string;
}

export type DecisionStatus =
  | "SETUP_INCOMPLETE"
  | "INSUFFICIENT_DATA"
  | "NO_ACTION"
  | "ACTION_NEEDED";

export type MarketRegime =
  | "BULL_TREND"
  | "PULLBACK_IN_UPTREND"
  | "EARLY_RECOVERY"
  | "RECLAIM_ATTEMPT"
  | "RANGE"
  | "WEAK_DOWNTREND"
  | "BREAKDOWN_RISK";

export type DecisionSetupState =
  | "READY"
  | "PROMISING"
  | "BLOCKED"
  | "NOT_APPLICABLE";

export type DecisionTriggerState =
  | "CONFIRMED"
  | "PENDING"
  | "BEARISH_CONFIRMATION"
  | "NOT_APPLICABLE";

export type DecisionRiskLevel = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";

export type InvalidationState = "CLEAR" | "UNCLEAR" | "BROKEN";

export type ActionNeededReason =
  | "COMPLETE_SETUP"
  | "INVALID_RECORDED_STATE"
  | "MARKET_DATA_UNAVAILABLE"
  | "RISK_REVIEW_REQUIRED"
  | "ENTRY_REVIEW_REQUIRED"
  | "ADD_BUY_REVIEW_REQUIRED"
  | "REDUCE_REVIEW_REQUIRED"
  | "STATE_UPDATE_REMINDER";

export interface ActionNeededAlert {
  reason: ActionNeededReason;
  cooldownKey: string;
  message: string;
}

export interface DecisionDiagnosticsTimeframeSnapshot {
  trend: "UP" | "DOWN" | "FLAT";
  location: "LOWER" | "MIDDLE" | "UPPER";
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  atr14: number | null;
  rsi14: number | null;
  macdHistogram: number | null;
  volumeRatio: number | null;
  support: number | null;
  resistance: number | null;
  swingLow: number | null;
  swingHigh: number | null;
}

export interface DecisionDiagnostics {
  regime: {
    classification: MarketRegime;
    summary: string;
  } | null;
  setup: {
    kind: "ENTRY" | "ADD_BUY" | "REDUCE" | "NONE";
    state: DecisionSetupState;
    supports: string[];
    blockers: string[];
  };
  trigger: {
    state: DecisionTriggerState;
    confirmed: string[];
    missing: string[];
  };
  risk: {
    level: DecisionRiskLevel;
    invalidationState: InvalidationState;
    invalidationLevel: number | null;
    notes: string[];
  };
  indicators: {
    price: number | null;
    timeframes: Record<SupportedTimeframe, DecisionDiagnosticsTimeframeSnapshot>;
  };
}

export interface DecisionResult {
  status: DecisionStatus;
  summary: string;
  reasons: string[];
  actionable: boolean;
  symbol: SupportedMarket | null;
  generatedAt: string;
  alert: ActionNeededAlert | null;
  diagnostics?: DecisionDiagnostics | null;
}

export interface DecisionLogRecord {
  id: number;
  userId: number;
  market: SupportedMarket | null;
  status: DecisionStatus;
  summary: string;
  contextJson: string;
  notificationSent: boolean;
  createdAt: string;
}

export interface NotificationEventRecord {
  id: number;
  userId: number;
  eventType: string;
  market: SupportedMarket | null;
  payloadJson: string;
  createdAt: string;
}

export interface UserStateBundle {
  user: User;
  accountState: AccountState | null;
  positions: Partial<Record<SupportedAsset, PositionState>>;
}

export type PaperTradeAction = "HOLD" | "ENTRY" | "ADD" | "REDUCE" | "EXIT";
export type PaperTradeSide = "BUY" | "SELL";
export type StrategyDecisionExecutionStatus = "EXECUTED" | "SKIPPED";
export type SignalQualityBucket = "HIGH" | "MEDIUM" | "BORDERLINE" | "LOW";
export type DecisionExecutionDisposition =
  | "IMMEDIATE"
  | "DEFERRED_CONFIRMATION"
  | "EXECUTED_AFTER_CONFIRMATION"
  | "SKIPPED";

export interface PaperAccount {
  id: number;
  userId: number;
  currency: "KRW";
  initialCash: number;
  cashBalance: number;
  realizedPnl: number;
  totalFeesPaid: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaperPosition {
  id: number;
  userId: number;
  asset: SupportedAsset;
  market: SupportedMarket;
  quantity: number;
  averageEntryPrice: number;
  lastMarkPrice: number | null;
  realizedPnl: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaperTrade {
  id: number;
  userId: number;
  accountId: number;
  asset: SupportedAsset;
  market: SupportedMarket;
  side: PaperTradeSide;
  action: Exclude<PaperTradeAction, "HOLD">;
  quantity: number;
  fillPrice: number;
  grossAmount: number;
  feeAmount: number;
  realizedPnl: number;
  slippageRate: number;
  note: string | null;
  createdAt: string;
}

export interface EquitySnapshot {
  id: number;
  userId: number;
  accountId: number;
  asset: SupportedAsset | null;
  cashBalance: number;
  positionMarketValue: number;
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalReturnPct: number;
  createdAt: string;
}

export interface StrategyDecisionRecord {
  id: number;
  userId: number;
  asset: SupportedAsset;
  market: SupportedMarket;
  action: PaperTradeAction;
  executionStatus: StrategyDecisionExecutionStatus;
  summary: string;
  reasons: string[];
  rationale: unknown;
  referencePrice: number;
  fillPrice: number | null;
  tradeId: number | null;
  createdAt: string;
}

export interface PaperTradingContext {
  user: Pick<User, "id" | "telegramUserId" | "telegramChatId" | "locale" | "sleepModeEnabled">;
  asset: SupportedAsset;
  market: SupportedMarket;
  account: PaperAccount;
  position: PaperPosition | null;
  portfolio: {
    totalEquity: number;
    assetMarketValue: number;
    totalExposureValue: number;
    assetExposureRatio: number;
    totalExposureRatio: number;
  };
  latestDecision: StrategyDecisionRecord | null;
  recentExit: {
    tradeId: number | null;
    createdAt: string | null;
    hoursSinceExit: number | null;
  };
  marketSnapshot: MarketSnapshot;
  generatedAt: string;
  settings: PaperTradingSettings;
}

export interface PaperTradingDecision {
  action: PaperTradeAction;
  summary: string;
  reasons: string[];
  targetCashToUse: number;
  targetQuantityFraction: number | null;
  referencePrice: number;
  executionDisposition: DecisionExecutionDisposition;
  signalQuality: {
    score: number;
    bucket: SignalQualityBucket;
    confirmationRequired: boolean;
    confirmationSatisfied: boolean;
    reentryPenaltyApplied: boolean;
  };
  exposureGuardrails: {
    perAssetMaxAllocation: number;
    totalPortfolioMaxExposure: number;
    remainingAssetCapacity: number;
    remainingPortfolioCapacity: number;
  };
  diagnostics: {
    regime: MarketRegime;
    riskLevel: DecisionRiskLevel;
    invalidationState: InvalidationState;
    invalidationLevel: number | null;
    pullbackZone: boolean;
    reclaimStructure: boolean;
    breakoutHoldStructure: boolean;
    upperRangeChase: boolean;
    currentPrice: number;
    cashBalance: number;
    positionQuantity: number;
    bullishEvidenceCount?: number;
    weaknessEvidenceCount?: number;
  };
}

export interface PaperExecutionResult {
  action: PaperTradeAction;
  executed: boolean;
  executionDisposition: DecisionExecutionDisposition;
  summary: string;
  reasons: string[];
  trade: PaperTrade | null;
  updatedAccount: PaperAccount;
  updatedPosition: PaperPosition | null;
  referencePrice: number;
  fillPrice: number | null;
  latestMarketPrice: number | null;
}

export interface PaperPerformanceSnapshot {
  account: PaperAccount;
  positions: Record<SupportedAsset, PaperPosition | null>;
  latestPrices: Record<SupportedAsset, number | null>;
  recentTrades: PaperTrade[];
  latestEquity: EquitySnapshot | null;
  totalEquity: number;
  unrealizedPnl: number;
  cumulativeReturnPct: number;
  cumulativeClosedTradeCount: number;
  cumulativeWinningTradeCount: number;
  cumulativeWinRate: number | null;
  cumulativeRealizedPnlFromTrades: number;
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

export type PaperTradingSettingSource = "default" | "env";

export interface PaperTradingSettingsView {
  values: PaperTradingSettings;
  scope: "global";
  sourceByField: Record<keyof PaperTradingSettings, PaperTradingSettingSource>;
}

export interface PaperDailySummary {
  timezone: "Asia/Seoul";
  dayLabel: string;
  tradeCount: number;
  realizedPnl: number;
  currentTotalEquity: number;
  actionCounts: Record<SupportedAsset, Partial<Record<PaperTradeAction, number>>>;
}

export interface PaperDecisionSnapshot {
  latestByAsset: Record<SupportedAsset, StrategyDecisionRecord | null>;
}
