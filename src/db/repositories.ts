import type {
  AccountState,
  DecisionLogRecord,
  EquitySnapshot,
  PaperAccount,
  PaperPerformanceSnapshot,
  PaperPosition,
  PaperTrade,
  PositionState,
  StrategyDecisionRecord as DomainStrategyDecisionRecord,
  SupportedLocale,
  SupportedAsset,
  SupportedMarket,
  TrackedAssetPreference,
  User,
  UserStateBundle,
} from "../domain/types.js";
import type {
  AccountStateRecord,
  DecisionLogInput,
  DecisionLogLookup,
  EquitySnapshotRecord,
  PaperAccountRecord,
  PaperPositionRecord,
  PaperTradeRecord,
  PositionStateRecord,
  PositionStateInput,
  StrategyDecisionRecord,
  UserRecord,
  UserStateSnapshot,
} from "../types/persistence.js";
import type { D1DatabaseLike } from "./db.js";
import {
  createDecisionLog,
  getLatestDecisionLogForUser,
  getLatestDecisionLogForUserAsset,
  listDecisionLogsForUser,
  listRecentDecisionLogsForUserAsset,
} from "./decision-logs.js";
import {
  createEquitySnapshot,
  getLatestEquitySnapshotForUser,
} from "./equity-snapshots.js";
import {
  createNotificationEvent,
  getLatestNotificationEventForUserAssetReason,
  listRecentNotificationEventsForUser,
} from "./notification-events.js";
import {
  ensurePaperAccountForUser,
  getPaperAccountByUserId,
  savePaperAccount,
} from "./paper-accounts.js";
import {
  getPaperPositionByUserAsset,
  listPaperPositionsForUser,
  savePaperPosition,
} from "./paper-positions.js";
import {
  createPaperTrade,
  getCumulativeClosedTradeStatsForUser,
  listRecentPaperTradesForUser,
} from "./paper-trades.js";
import {
  getHourlyHealthInspection,
  getLatestDecisionLogInspection,
  getLatestNotificationEventInspection,
  listRecentDecisionLogInspections,
  listRecentNotificationEventInspections,
} from "./operator-visibility.js";
import {
  createStrategyDecision,
  listRecentStrategyDecisionsForUser,
} from "./strategy-decisions.js";
import {
  loadUserStateSnapshotByTelegramId,
  loadUserStateSnapshotByUserId,
  saveUserReportedAccountState,
  saveUserReportedPositionState,
} from "./user-state.js";
import {
  getUserByTelegramId,
  setUserLocale,
  setUserOnboardingComplete,
  setUserSleepMode,
  setUserTrackedAssets,
  upsertUser,
} from "./users.js";
import { assessReadiness } from "../readiness.js";
import { PAPER_INITIAL_CASH_KRW } from "../paper/constants.js";
import {
  buildEquitySnapshot,
  calculatePositionMarketValue,
  calculateUnrealizedPnl,
} from "../paper/math.js";

interface TelegramProfileInput {
  telegramUserId: string;
  telegramChatId: string;
  username?: string | null;
  displayName?: string | null;
  languageCode?: string | null;
  locale?: SupportedLocale | null;
}

export interface RecordDecisionLogParams {
  userId: number;
  asset: SupportedAsset;
  market: SupportedMarket;
  status: DecisionLogInput["decisionStatus"];
  summary: string;
  reasons: string[];
  actionable: boolean;
  contextJson: string;
  notificationSent: boolean;
}

export interface RecordNotificationEventParams {
  userId: number;
  decisionLogId?: number | null;
  asset?: SupportedAsset | null;
  reasonKey?: string | null;
  deliveryStatus?: "SENT" | "SKIPPED";
  eventType: string;
  channel?: string;
  payload?: unknown;
  sentAt?: string | null;
  cooldownUntil?: string | null;
  suppressedBy?: string | null;
}

export interface TelegramStatusSnapshot {
  user: User;
  accountState: AccountState | null;
  positions: Partial<Record<SupportedAsset, PositionState>>;
}

export interface TelegramProfileSnapshot {
  telegramUserId: string;
  telegramChatId: string;
  username?: string | null;
  displayName?: string | null;
}

export async function ensureTelegramUser(
  db: D1DatabaseLike,
  input: TelegramProfileInput,
): Promise<User> {
  const record = await upsertUser(db, {
    telegramUserId: input.telegramUserId,
    telegramChatId: input.telegramChatId,
    username: input.username ?? null,
    displayName: input.displayName ?? null,
    telegramLanguageCode: input.languageCode ?? null,
    locale: input.locale ?? null,
  });

  await ensurePaperAccountForUser(db, record.id, PAPER_INITIAL_CASH_KRW);

  return mapUserRecord(record);
}

export async function setCashByTelegramUserId(
  db: D1DatabaseLike,
  telegramUserId: string,
  availableCash: number,
): Promise<AccountState> {
  const record = await saveUserReportedAccountState(db, telegramUserId, {
    availableCash,
  });
  await syncUserSetupCompleteness(db, telegramUserId);

  return mapAccountStateRecord(record);
}

export async function setPositionByTelegramUserId(
  db: D1DatabaseLike,
  telegramUserId: string,
  input: PositionStateInput,
): Promise<PositionState> {
  const record = await saveUserReportedPositionState(db, telegramUserId, input);
  await syncUserSetupCompleteness(db, telegramUserId);

  return mapPositionRecord(record);
}

export async function setSleepModeByTelegramUserId(
  db: D1DatabaseLike,
  telegramUserId: string,
  enabled: boolean,
): Promise<User> {
  const record = await setUserSleepMode(db, telegramUserId, enabled);
  return mapUserRecord(record);
}

export async function setTrackedAssetsByTelegramUserId(
  db: D1DatabaseLike,
  telegramUserId: string,
  trackedAssets: TrackedAssetPreference,
): Promise<User> {
  const record = await setUserTrackedAssets(db, telegramUserId, trackedAssets);
  await syncUserSetupCompleteness(db, telegramUserId);
  return mapUserRecord(record);
}

export async function setLocaleByTelegramUserId(
  db: D1DatabaseLike,
  telegramUserId: string,
  locale: SupportedLocale,
): Promise<User> {
  const record = await setUserLocale(db, telegramUserId, locale);
  return mapUserRecord(record);
}

export async function getTelegramStatusSnapshot(
  db: D1DatabaseLike,
  telegramUserId: string,
): Promise<TelegramStatusSnapshot | null> {
  const snapshot = await loadUserStateSnapshotByTelegramId(db, telegramUserId);
  if (!snapshot) {
    return null;
  }

  return mapUserStateSnapshot(snapshot);
}

export async function getUserStateBundleByUserId(
  db: D1DatabaseLike,
  userId: number,
): Promise<UserStateBundle | null> {
  const snapshot = await loadUserStateSnapshotByUserId(db, userId);
  return snapshot ? mapUserStateSnapshot(snapshot) : null;
}

export async function listUsersForHourlyRun(
  db: D1DatabaseLike,
): Promise<UserStateBundle[]> {
  const result = await db
    .prepare(
      `SELECT telegram_user_id
       FROM users
       ORDER BY id ASC`,
    )
    .all<{ telegram_user_id: string }>();

  const bundles = await Promise.all(
    result.results.map(async ({ telegram_user_id }) => {
      const snapshot = await loadUserStateSnapshotByTelegramId(db, telegram_user_id);
      return snapshot ? mapUserStateSnapshot(snapshot) : null;
    }),
  );

  return bundles.filter((bundle): bundle is UserStateBundle => bundle !== null);
}

export async function recordDecisionLog(
  db: D1DatabaseLike,
  params: RecordDecisionLogParams,
): Promise<DecisionLogRecord> {
  const record = await createDecisionLog(db, {
    userId: params.userId,
    asset: params.asset,
    symbol: params.market,
    decisionStatus: params.status,
    summary: params.summary,
    reasons: params.reasons,
    actionable: params.actionable,
    notificationEmitted: params.notificationSent,
    context: JSON.parse(params.contextJson) as unknown,
  });

  return {
    id: record.id,
    userId: record.userId,
    market: record.symbol,
    status: record.decisionStatus,
    summary: record.summary,
    contextJson: JSON.stringify(record.context),
    notificationSent: record.notificationEmitted,
    createdAt: record.createdAt,
  };
}

export async function getLatestDecisionLogSummary(
  db: D1DatabaseLike,
  userId: number,
  asset: SupportedAsset,
): Promise<DecisionLogLookup | null> {
  return getLatestDecisionLogForUserAsset(db, userId, asset);
}

export async function getLatestDecisionRecordForUser(
  db: D1DatabaseLike,
  userId: number,
) {
  return getLatestDecisionLogForUser(db, userId);
}

export async function listRecentDecisionRecordsForUser(
  db: D1DatabaseLike,
  userId: number,
  limit = 10,
) {
  return listDecisionLogsForUser(db, userId, limit);
}

export async function listRecentDecisionLogSummaries(
  db: D1DatabaseLike,
  userId: number,
  asset: SupportedAsset,
  limit = 10,
) {
  return listRecentDecisionLogsForUserAsset(db, userId, asset, limit);
}

export async function recordNotificationEvent(
  db: D1DatabaseLike,
  params: RecordNotificationEventParams,
) {
  return createNotificationEvent(db, params);
}

export async function getLatestNotificationEventSummary(
  db: D1DatabaseLike,
  userId: number,
  asset: SupportedAsset | null,
  reasonKey: string,
) {
  return getLatestNotificationEventForUserAssetReason(db, userId, asset, reasonKey);
}

export async function listRecentNotificationEventSummaries(
  db: D1DatabaseLike,
  userId: number,
  limit = 25,
) {
  return listRecentNotificationEventsForUser(db, userId, limit);
}

export async function getLatestDecisionLogInspectionForUser(
  db: D1DatabaseLike,
  userId: number,
) {
  return getLatestDecisionLogInspection(db, userId);
}

export async function listRecentDecisionLogInspectionsForUser(
  db: D1DatabaseLike,
  userId: number,
  limit = 10,
) {
  return listRecentDecisionLogInspections(db, userId, limit);
}

export async function getLatestNotificationEventInspectionForUser(
  db: D1DatabaseLike,
  userId: number,
) {
  return getLatestNotificationEventInspection(db, userId);
}

export async function listRecentNotificationEventInspectionsForUser(
  db: D1DatabaseLike,
  userId: number,
  limit = 10,
) {
  return listRecentNotificationEventInspections(db, userId, limit);
}

export async function getHourlyHealthInspectionForUser(
  db: D1DatabaseLike,
  userId: number,
  limit = 10,
) {
  return getHourlyHealthInspection(db, userId, limit);
}

export async function getUserByTelegramUserId(
  db: D1DatabaseLike,
  telegramUserId: string,
): Promise<User | null> {
  const record = await getUserByTelegramId(db, telegramUserId);
  return record ? mapUserRecord(record) : null;
}

export async function ensurePaperAccountByUserId(
  db: D1DatabaseLike,
  userId: number,
): Promise<PaperAccount> {
  const record = await ensurePaperAccountForUser(db, userId, PAPER_INITIAL_CASH_KRW);
  return mapPaperAccountRecord(record);
}

export async function getPaperAccountSnapshotByUserId(
  db: D1DatabaseLike,
  userId: number,
): Promise<PaperAccount | null> {
  const record = await getPaperAccountByUserId(db, userId);
  return record ? mapPaperAccountRecord(record) : null;
}

export async function getPaperPositionSnapshotByUserAsset(
  db: D1DatabaseLike,
  userId: number,
  asset: SupportedAsset,
): Promise<PaperPosition | null> {
  const record = await getPaperPositionByUserAsset(db, userId, asset);
  return record ? mapPaperPositionRecord(record) : null;
}

export async function listPaperPositionSnapshotsForUser(
  db: D1DatabaseLike,
  userId: number,
): Promise<Record<SupportedAsset, PaperPosition | null>> {
  const records = await listPaperPositionsForUser(db, userId);
  const positions: Record<SupportedAsset, PaperPosition | null> = {
    BTC: null,
    ETH: null,
  };

  for (const record of records) {
    positions[record.asset] = mapPaperPositionRecord(record);
  }

  return positions;
}

export async function savePaperAccountSnapshot(
  db: D1DatabaseLike,
  account: PaperAccount,
): Promise<PaperAccount> {
  const record = await savePaperAccount(db, {
    id: account.id,
    userId: account.userId,
    currency: account.currency,
    initialCash: account.initialCash,
    cashBalance: account.cashBalance,
    realizedPnl: account.realizedPnl,
    totalFeesPaid: account.totalFeesPaid,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  });

  return mapPaperAccountRecord(record);
}

export async function savePaperPositionSnapshot(
  db: D1DatabaseLike,
  position: PaperPosition,
): Promise<PaperPosition> {
  const record = await savePaperPosition(db, {
    id: position.id,
    userId: position.userId,
    asset: position.asset,
    market: position.market,
    quantity: position.quantity,
    averageEntryPrice: position.averageEntryPrice,
    lastMarkPrice: position.lastMarkPrice,
    realizedPnl: position.realizedPnl,
    createdAt: position.createdAt,
    updatedAt: position.updatedAt,
  });

  return mapPaperPositionRecord(record);
}

export async function createPaperTradeRecord(
  db: D1DatabaseLike,
  trade: Omit<PaperTrade, "id">,
): Promise<PaperTrade> {
  const record = await createPaperTrade(db, {
    userId: trade.userId,
    accountId: trade.accountId,
    asset: trade.asset,
    market: trade.market,
    side: trade.side,
    action: trade.action,
    quantity: trade.quantity,
    fillPrice: trade.fillPrice,
    grossAmount: trade.grossAmount,
    feeAmount: trade.feeAmount,
    realizedPnl: trade.realizedPnl,
    slippageRate: trade.slippageRate,
    note: trade.note,
    createdAt: trade.createdAt,
  });

  return mapPaperTradeRecord(record);
}

export async function createEquitySnapshotRecord(
  db: D1DatabaseLike,
  snapshot: Omit<EquitySnapshot, "id" | "createdAt">,
): Promise<EquitySnapshot> {
  const record = await createEquitySnapshot(db, snapshot);
  return mapEquitySnapshotRecord(record);
}

export async function createStrategyDecisionRecord(
  db: D1DatabaseLike,
  decision: Omit<DomainStrategyDecisionRecord, "id" | "createdAt">,
): Promise<DomainStrategyDecisionRecord> {
  const record = await createStrategyDecision(db, {
    userId: decision.userId,
    asset: decision.asset,
    market: decision.market,
    action: decision.action,
    executionStatus: decision.executionStatus,
    summary: decision.summary,
    reasons: decision.reasons,
    rationale: decision.rationale,
    referencePrice: decision.referencePrice,
    fillPrice: decision.fillPrice,
    tradeId: decision.tradeId,
  });

  return mapStrategyDecisionRecord(record);
}

export async function listRecentPaperTrades(
  db: D1DatabaseLike,
  userId: number,
  limit = 10,
): Promise<PaperTrade[]> {
  const records = await listRecentPaperTradesForUser(db, userId, limit);
  return records.map(mapPaperTradeRecord);
}

export async function listRecentStrategyDecisions(
  db: D1DatabaseLike,
  userId: number,
  limit = 10,
): Promise<DomainStrategyDecisionRecord[]> {
  const records = await listRecentStrategyDecisionsForUser(db, userId, limit);
  return records.map(mapStrategyDecisionRecord);
}

export async function getPaperPerformanceSnapshot(
  db: D1DatabaseLike,
  userId: number,
): Promise<PaperPerformanceSnapshot> {
  const accountRecord = await ensurePaperAccountForUser(db, userId, PAPER_INITIAL_CASH_KRW);
  const [positions, recentTrades, latestEquityRecord] = await Promise.all([
    listPaperPositionSnapshotsForUser(db, userId),
    listRecentPaperTrades(db, userId, 10),
    getLatestEquitySnapshotForUser(db, userId),
  ]);
  const cumulativeStats = await getCumulativeClosedTradeStatsForUser(db, userId);

  const latestPrices: Record<SupportedAsset, number | null> = {
    BTC: positions.BTC?.lastMarkPrice ?? null,
    ETH: positions.ETH?.lastMarkPrice ?? null,
  };
  const totalEquity =
    latestEquityRecord?.totalEquity ??
    accountRecord.cashBalance +
      calculatePositionMarketValue(positions.BTC, latestPrices.BTC) +
      calculatePositionMarketValue(positions.ETH, latestPrices.ETH);
  const unrealizedPnl =
    latestEquityRecord?.unrealizedPnl ??
    calculateUnrealizedPnl(positions.BTC, latestPrices.BTC) +
      calculateUnrealizedPnl(positions.ETH, latestPrices.ETH);
  const cumulativeReturnPct =
    latestEquityRecord?.totalReturnPct ??
    (accountRecord.initialCash > 0
      ? ((totalEquity - accountRecord.initialCash) / accountRecord.initialCash) * 100
      : 0);
  return {
    account: mapPaperAccountRecord(accountRecord),
    positions,
    latestPrices,
    recentTrades,
    latestEquity: latestEquityRecord ? mapEquitySnapshotRecord(latestEquityRecord) : null,
    totalEquity,
    unrealizedPnl,
    cumulativeReturnPct,
    cumulativeClosedTradeCount: cumulativeStats.closedTradeCount,
    cumulativeWinningTradeCount: cumulativeStats.winningTradeCount,
    cumulativeWinRate:
      cumulativeStats.closedTradeCount > 0
        ? cumulativeStats.winningTradeCount / cumulativeStats.closedTradeCount
        : null,
    cumulativeRealizedPnlFromTrades: cumulativeStats.realizedPnl,
  };
}

export async function createAggregateEquitySnapshot(
  db: D1DatabaseLike,
  userId: number,
  account: PaperAccount,
  asset: SupportedAsset | null,
): Promise<EquitySnapshot> {
  const positions = await listPaperPositionSnapshotsForUser(db, userId);
  const latestPrices: Record<SupportedAsset, number | null> = {
    BTC: positions.BTC?.lastMarkPrice ?? null,
    ETH: positions.ETH?.lastMarkPrice ?? null,
  };
  const snapshot = buildEquitySnapshot({
    userId,
    account,
    asset,
    positions,
    latestPrices,
  });

  return createEquitySnapshotRecord(db, snapshot);
}

function mapUserStateSnapshot(snapshot: UserStateSnapshot): UserStateBundle {
  return {
    user: mapUserRecord(snapshot.user),
    accountState: snapshot.accountState
      ? mapAccountStateRecord(snapshot.accountState)
      : null,
    positions: mapPositionRecords(snapshot.positionStates),
  };
}

function mapUserRecord(record: UserRecord): User {
  return {
    id: record.id,
    telegramUserId: record.telegramUserId,
    telegramChatId: record.telegramChatId,
    username: record.username,
    displayName: record.displayName,
    locale: record.locale,
    trackedAssets: record.trackedAssets,
    sleepModeEnabled: record.sleepMode,
    onboardingComplete: record.onboardingComplete,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapAccountStateRecord(record: AccountStateRecord): AccountState {
  return {
    id: record.id,
    userId: record.userId,
    availableCash: record.availableCash,
    reportedAt: record.reportedAt,
    source: "USER_REPORTED",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapPositionRecords(
  records: PositionStateRecord[],
): Partial<Record<SupportedAsset, PositionState>> {
  const positions: Partial<Record<SupportedAsset, PositionState>> = {};
  for (const record of records) {
    positions[record.asset] = mapPositionRecord(record);
  }
  return positions;
}

function mapPositionRecord(record: PositionStateRecord): PositionState {
  return {
    id: record.id,
    userId: record.userId,
    asset: record.asset,
    quantity: record.quantity,
    averageEntryPrice: record.averageEntryPrice,
    reportedAt: record.reportedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapPaperAccountRecord(record: PaperAccountRecord): PaperAccount {
  return {
    id: record.id,
    userId: record.userId,
    currency: record.currency,
    initialCash: record.initialCash,
    cashBalance: record.cashBalance,
    realizedPnl: record.realizedPnl,
    totalFeesPaid: record.totalFeesPaid,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapPaperPositionRecord(record: PaperPositionRecord): PaperPosition {
  return {
    id: record.id,
    userId: record.userId,
    asset: record.asset,
    market: record.market,
    quantity: record.quantity,
    averageEntryPrice: record.averageEntryPrice,
    lastMarkPrice: record.lastMarkPrice,
    realizedPnl: record.realizedPnl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapPaperTradeRecord(record: PaperTradeRecord): PaperTrade {
  return {
    id: record.id,
    userId: record.userId,
    accountId: record.accountId,
    asset: record.asset,
    market: record.market,
    side: record.side,
    action: record.action,
    quantity: record.quantity,
    fillPrice: record.fillPrice,
    grossAmount: record.grossAmount,
    feeAmount: record.feeAmount,
    realizedPnl: record.realizedPnl,
    slippageRate: record.slippageRate,
    note: record.note,
    createdAt: record.createdAt,
  };
}

function mapEquitySnapshotRecord(
  record: EquitySnapshotRecord,
): EquitySnapshot {
  return {
    id: record.id,
    userId: record.userId,
    accountId: record.accountId,
    asset: record.asset,
    cashBalance: record.cashBalance,
    positionMarketValue: record.positionMarketValue,
    totalEquity: record.totalEquity,
    realizedPnl: record.realizedPnl,
    unrealizedPnl: record.unrealizedPnl,
    totalReturnPct: record.totalReturnPct,
    createdAt: record.createdAt,
  };
}

function mapStrategyDecisionRecord(
  record: StrategyDecisionRecord,
): DomainStrategyDecisionRecord {
  return {
    id: record.id,
    userId: record.userId,
    asset: record.asset,
    market: record.market,
    action: record.action,
    executionStatus: record.executionStatus,
    summary: record.summary,
    reasons: record.reasons,
    rationale: record.rationale,
    referencePrice: record.referencePrice,
    fillPrice: record.fillPrice,
    tradeId: record.tradeId,
    createdAt: record.createdAt,
  };
}

async function syncUserSetupCompleteness(
  db: D1DatabaseLike,
  telegramUserId: string,
): Promise<void> {
  const snapshot = await loadUserStateSnapshotByTelegramId(db, telegramUserId);
  if (!snapshot) {
    return;
  }

  const readiness = assessReadiness(mapUserStateSnapshot(snapshot));
  await setUserOnboardingComplete(db, telegramUserId, readiness.isReady);
}
