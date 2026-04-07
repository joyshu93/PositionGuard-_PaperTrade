export type AssetSymbol = "BTC" | "ETH";
export type MarketSymbol = "KRW-BTC" | "KRW-ETH";
export type TrackedAssetPreferenceRecord = "BTC" | "ETH" | "BTC,ETH";
export type SupportedLocaleRecord = "ko" | "en";

export interface UserRecord {
  id: number;
  telegramUserId: string;
  telegramChatId: string | null;
  username: string | null;
  displayName: string | null;
  locale: SupportedLocaleRecord | null;
  trackedAssets: TrackedAssetPreferenceRecord;
  sleepMode: boolean;
  onboardingComplete: boolean;
  nextPaperStartCash: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileInput {
  telegramUserId: string;
  telegramChatId?: string | null;
  username?: string | null;
  displayName?: string | null;
  telegramLanguageCode?: string | null;
  locale?: SupportedLocaleRecord | null;
  trackedAssets?: TrackedAssetPreferenceRecord | null;
}

export interface AccountStateRecord {
  id: number;
  userId: number;
  currency: string;
  availableCash: number;
  source: "user_reported";
  reportedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountStateInput {
  currency?: string;
  availableCash: number;
  reportedAt?: string;
}

export interface PositionStateRecord {
  id: number;
  userId: number;
  asset: AssetSymbol;
  quantity: number;
  averageEntryPrice: number;
  source: "user_reported";
  reportedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PositionStateInput {
  asset: AssetSymbol;
  quantity: number;
  averageEntryPrice: number;
  reportedAt?: string;
}

export type DecisionStatus =
  | "SETUP_INCOMPLETE"
  | "INSUFFICIENT_DATA"
  | "NO_ACTION"
  | "ACTION_NEEDED";
export type NotificationDeliveryStatus = "SENT" | "SKIPPED";

export interface DecisionLogInput {
  userId: number;
  asset: AssetSymbol;
  symbol: MarketSymbol;
  decisionStatus: DecisionStatus;
  summary: string;
  reasons: string[];
  actionable: boolean;
  notificationEmitted?: boolean;
  context: unknown;
  createdAt?: string;
}

export interface DecisionLogRecord {
  id: number;
  userId: number;
  asset: AssetSymbol;
  symbol: MarketSymbol;
  decisionStatus: DecisionStatus;
  summary: string;
  reasons: string[];
  actionable: boolean;
  notificationEmitted: boolean;
  context: unknown;
  createdAt: string;
}

export interface NotificationEventInput {
  userId: number;
  decisionLogId?: number | null;
  asset?: AssetSymbol | null;
  reasonKey?: string | null;
  deliveryStatus?: NotificationDeliveryStatus;
  eventType: string;
  channel?: string;
  payload?: unknown;
  sentAt?: string | null;
  cooldownUntil?: string | null;
  suppressedBy?: string | null;
}

export interface NotificationEventRecord {
  id: number;
  userId: number;
  decisionLogId: number | null;
  asset: AssetSymbol | null;
  reasonKey: string | null;
  deliveryStatus: NotificationDeliveryStatus;
  eventType: string;
  channel: string;
  payload: unknown;
  sentAt: string | null;
  cooldownUntil: string | null;
  suppressedBy: string | null;
  createdAt: string;
}

export interface NotificationEventLookup {
  id: number;
  userId: number;
  asset: AssetSymbol | null;
  reasonKey: string | null;
  deliveryStatus: NotificationDeliveryStatus;
  eventType: string;
  sentAt: string | null;
  cooldownUntil: string | null;
  createdAt: string;
}

export interface UserStateSnapshot {
  user: UserRecord;
  accountState: AccountStateRecord | null;
  positionStates: PositionStateRecord[];
}

export interface DecisionLogLookup {
  userId: number;
  asset: AssetSymbol;
  decisionStatus: DecisionStatus;
  summary: string;
  createdAt: string;
}

export interface PaperAccountRecord {
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

export interface PaperPositionRecord {
  id: number;
  userId: number;
  asset: AssetSymbol;
  market: MarketSymbol;
  quantity: number;
  averageEntryPrice: number;
  lastMarkPrice: number | null;
  realizedPnl: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaperTradeInput {
  userId: number;
  accountId: number;
  asset: AssetSymbol;
  market: MarketSymbol;
  side: "BUY" | "SELL";
  action: "ENTRY" | "ADD" | "REDUCE" | "EXIT";
  quantity: number;
  fillPrice: number;
  grossAmount: number;
  feeAmount: number;
  realizedPnl: number;
  slippageRate: number;
  note?: string | null;
  createdAt?: string;
}

export interface PaperTradeRecord extends PaperTradeInput {
  id: number;
  note: string | null;
  createdAt: string;
}

export interface EquitySnapshotInput {
  userId: number;
  accountId: number;
  asset: AssetSymbol | null;
  cashBalance: number;
  positionMarketValue: number;
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalReturnPct: number;
  createdAt?: string;
}

export interface EquitySnapshotRecord extends EquitySnapshotInput {
  id: number;
  createdAt: string;
}

export interface StrategyDecisionInput {
  userId: number;
  asset: AssetSymbol;
  market: MarketSymbol;
  action: "HOLD" | "ENTRY" | "ADD" | "REDUCE" | "EXIT";
  executionStatus: "EXECUTED" | "SKIPPED";
  summary: string;
  reasons: string[];
  rationale: unknown;
  referencePrice: number;
  fillPrice?: number | null;
  tradeId?: number | null;
  createdAt?: string;
}

export interface StrategyDecisionRecord {
  id: number;
  userId: number;
  asset: AssetSymbol;
  market: MarketSymbol;
  action: "HOLD" | "ENTRY" | "ADD" | "REDUCE" | "EXIT";
  executionStatus: "EXECUTED" | "SKIPPED";
  summary: string;
  reasons: string[];
  rationale: unknown;
  referencePrice: number;
  fillPrice: number | null;
  tradeId: number | null;
  createdAt: string;
}
