import { createRuntimeConfig, type Env } from "./env.js";
import type {
  PaperExecutionResult,
  PaperPerformanceSnapshot,
  SupportedAsset,
  SupportedLocale,
  SupportedMarket,
  UserStateBundle,
} from "./domain/types.js";
import { createTelegramBotClient } from "./telegram/client.js";
import { getMarketForAsset, getMarketSnapshotResult } from "./upbit.js";
import {
  createAggregateEquitySnapshot,
  createPaperTradeRecord,
  createStrategyDecisionRecord,
  ensurePaperAccountByUserId,
  ensureTelegramUser,
  getPaperPerformanceSnapshot,
  getPaperPositionSnapshotByUserAsset,
  listUsersForHourlyRun,
  savePaperAccountSnapshot,
  savePaperPositionSnapshot,
} from "./db/repositories.js";
import { buildExecutionSummary, buildHourlySummaryMessage } from "./paper/reporting.js";
import { decidePaperTrade } from "./paper/strategy.js";
import {
  applyPaperFill,
  calculateBuyFill,
  calculateBuyQuantity,
  calculateSellFill,
  calculateSellQuantity,
  getPaperBuyFillPrice,
} from "./paper/math.js";
import { resolveUserLocale } from "./i18n/index.js";

const SUPPORTED_ASSETS: SupportedAsset[] = ["BTC", "ETH"];

export interface UserHourlyAssetResult {
  asset: SupportedAsset;
  execution: PaperExecutionResult;
}

export async function runHourlyCycle(env: Env): Promise<void> {
  const runtime = createRuntimeConfig(env);
  const telegramClient = createTelegramBotClient({
    TELEGRAM_BOT_TOKEN: runtime.telegramBotToken,
    ...(runtime.telegramWebhookSecret
      ? { TELEGRAM_WEBHOOK_SECRET: runtime.telegramWebhookSecret }
      : {}),
  });
  const userStates = await listUsersForHourlyRun(runtime.db);

  for (const userState of userStates) {
    await runUserHourlyCycle({
      db: runtime.db,
      telegramClient,
      userState,
      upbitBaseUrl: runtime.upbitBaseUrl,
    });
  }
}

export async function runUserHourlyCycle(params: {
  db: Env["DB"];
  telegramClient: ReturnType<typeof createTelegramBotClient>;
  userState: UserStateBundle;
  upbitBaseUrl: string | null;
  ensureAccount?: typeof ensurePaperAccountByUserId;
  processAssetCycle?: typeof processPaperTradingCycle;
  persistAggregateSnapshot?: typeof createAggregateEquitySnapshot;
  loadPerformanceSnapshot?: typeof getPaperPerformanceSnapshot;
}): Promise<{
  assetResults: UserHourlyAssetResult[];
  aggregateSnapshotCreated: boolean;
  performanceSnapshot: PaperPerformanceSnapshot;
}> {
  const {
    db,
    telegramClient,
    userState,
    upbitBaseUrl,
    ensureAccount = ensurePaperAccountByUserId,
    processAssetCycle = processPaperTradingCycle,
    persistAggregateSnapshot = createAggregateEquitySnapshot,
    loadPerformanceSnapshot = getPaperPerformanceSnapshot,
  } = params;

  await ensureAccount(db, userState.user.id);

  const assetResults: UserHourlyAssetResult[] = [];
  for (const asset of SUPPORTED_ASSETS) {
    const market = getMarketForAsset(asset);
    const execution = await processAssetCycle(
      db,
      telegramClient,
      userState,
      asset,
      market,
      upbitBaseUrl,
    );
    assetResults.push({ asset, execution });
  }

  const account = await ensureAccount(db, userState.user.id);
  await persistAggregateSnapshot(db, userState.user.id, account, null);
  const performanceSnapshot = await loadPerformanceSnapshot(db, userState.user.id);

  if (userState.user.telegramChatId && !userState.user.sleepModeEnabled) {
    const locale = resolveUserLocale(userState.user.locale ?? null);
    await telegramClient.sendMessage(
      Number(userState.user.telegramChatId),
      buildHourlySummaryMessage({
        btcAction: assetResults.find((result) => result.asset === "BTC")?.execution.action ?? "HOLD",
        ethAction: assetResults.find((result) => result.asset === "ETH")?.execution.action ?? "HOLD",
        snapshot: performanceSnapshot,
        locale,
      }),
    );
  }

  return {
    assetResults,
    aggregateSnapshotCreated: true,
    performanceSnapshot,
  };
}

export async function processPaperTradingCycle(
  db: Env["DB"],
  telegramClient: ReturnType<typeof createTelegramBotClient>,
  userState: UserStateBundle,
  asset: SupportedAsset,
  market: SupportedMarket,
  upbitBaseUrl: string | null = null,
): Promise<PaperExecutionResult> {
  const marketResult = await getMarketSnapshotResult(upbitBaseUrl ?? undefined, market);
  if (!marketResult.ok) {
    const skipped = await createStrategyDecisionRecord(db, {
      userId: userState.user.id,
      asset,
      market,
      action: "HOLD",
      executionStatus: "SKIPPED",
      summary: `${asset} paper decision skipped because market data was unavailable.`,
      reasons: [marketResult.message],
      rationale: {
        marketResult,
      },
      referencePrice: 0,
      fillPrice: null,
      tradeId: null,
    });

    return {
      action: skipped.action,
      executed: false,
      summary: skipped.summary,
      reasons: skipped.reasons,
      trade: null,
      updatedAccount: await ensurePaperAccountByUserId(db, userState.user.id),
      updatedPosition: await getPaperPositionSnapshotByUserAsset(db, userState.user.id, asset),
      referencePrice: 0,
      fillPrice: null,
      latestMarketPrice: null,
    };
  }

  const locale = resolveUserLocale(userState.user.locale ?? null);
  const account = await ensurePaperAccountByUserId(db, userState.user.id);
  const position = await getPaperPositionSnapshotByUserAsset(db, userState.user.id, asset);
  const context = {
    user: {
      id: userState.user.id,
      telegramUserId: userState.user.telegramUserId,
      telegramChatId: userState.user.telegramChatId,
      locale: userState.user.locale ?? null,
      sleepModeEnabled: userState.user.sleepModeEnabled,
    },
    asset,
    market,
    account,
    position,
    marketSnapshot: marketResult.snapshot,
    generatedAt: new Date().toISOString(),
  };
  const decision = decidePaperTrade(context);
  const execution = await executePaperDecision(db, {
    userId: userState.user.id,
    asset,
    market,
    account,
    position,
    decision,
  });

  await createStrategyDecisionRecord(db, {
    userId: userState.user.id,
    asset,
    market,
    action: decision.action,
    executionStatus: execution.executed ? "EXECUTED" : "SKIPPED",
    summary: execution.summary,
    reasons: execution.reasons,
    rationale: decision.diagnostics,
    referencePrice: execution.referencePrice,
    fillPrice: execution.fillPrice,
    tradeId: execution.trade?.id ?? null,
  });

  if (
    execution.executed &&
    execution.trade &&
    userState.user.telegramChatId &&
    !userState.user.sleepModeEnabled
  ) {
    const snapshot = await getPaperPerformanceSnapshot(db, userState.user.id);
    await telegramClient.sendMessage(
      Number(userState.user.telegramChatId),
      buildExecutionSummary({
        asset,
        action: execution.trade.action,
        quantity: execution.trade.quantity,
        fillPrice: execution.trade.fillPrice,
        realizedPnl: execution.trade.realizedPnl,
        totalEquity: snapshot.totalEquity,
        cumulativeReturnPct: snapshot.cumulativeReturnPct,
        locale,
      }),
    );
  }

  return execution;
}

async function executePaperDecision(
  db: Env["DB"],
  params: {
    userId: number;
    asset: SupportedAsset;
    market: SupportedMarket;
    account: Awaited<ReturnType<typeof ensurePaperAccountByUserId>>;
    position: Awaited<ReturnType<typeof getPaperPositionSnapshotByUserAsset>>;
    decision: ReturnType<typeof decidePaperTrade>;
  },
): Promise<PaperExecutionResult> {
  const { account, position, asset, market, decision } = params;

  if (decision.action === "HOLD") {
    if (position) {
      await savePaperPositionSnapshot(db, {
        ...position,
        lastMarkPrice: decision.referencePrice,
      });
    }

    return {
      action: "HOLD",
      executed: false,
      summary: decision.summary,
      reasons: decision.reasons,
      trade: null,
      updatedAccount: account,
      updatedPosition: position
        ? {
            ...position,
            lastMarkPrice: decision.referencePrice,
          }
        : null,
      referencePrice: decision.referencePrice,
      fillPrice: null,
      latestMarketPrice: decision.referencePrice,
    };
  }

  const fill =
    decision.action === "ENTRY" || decision.action === "ADD"
      ? calculateBuyFill(
          decision.action,
          calculateBuyQuantity(
            decision.targetCashToUse,
            account.cashBalance,
            getPaperBuyFillPrice(decision.referencePrice),
          ),
          decision.referencePrice,
        )
      : calculateSellFill(
          decision.action,
          calculateSellQuantity(position?.quantity ?? 0, decision.targetQuantityFraction ?? 0),
          decision.referencePrice,
          position?.averageEntryPrice ?? 0,
        );

  if (!fill) {
    return {
      action: decision.action,
      executed: false,
      summary: `${decision.summary} Execution was skipped because quantity was below the paper-trade threshold.`,
      reasons: [...decision.reasons, "Trade size was too small after fees and slippage assumptions."],
      trade: null,
      updatedAccount: account,
      updatedPosition: position
        ? {
            ...position,
            lastMarkPrice: decision.referencePrice,
          }
        : null,
      referencePrice: decision.referencePrice,
      fillPrice: null,
      latestMarketPrice: decision.referencePrice,
    };
  }

  const nextState = applyPaperFill({
    account,
    position,
    asset,
    market,
    fill,
  });

  const updatedAccount = await savePaperAccountSnapshot(db, nextState.account);
  const updatedPosition = await savePaperPositionSnapshot(db, {
    ...nextState.position,
    lastMarkPrice: decision.referencePrice,
  });
  const trade = await createPaperTradeRecord(db, {
    userId: params.userId,
    accountId: updatedAccount.id,
    asset,
    market,
    side: fill.side,
    action: fill.action,
    quantity: fill.quantity,
    fillPrice: fill.fillPrice,
    grossAmount: fill.grossAmount,
    feeAmount: fill.feeAmount,
    realizedPnl: fill.realizedPnl,
    slippageRate: fill.slippageRate,
    note: decision.summary,
    createdAt: new Date().toISOString(),
  });

  return {
    action: decision.action,
    executed: true,
    summary: decision.summary,
    reasons: decision.reasons,
    trade,
    updatedAccount,
    updatedPosition,
    referencePrice: decision.referencePrice,
    fillPrice: fill.fillPrice,
    latestMarketPrice: decision.referencePrice,
  };
}

export async function bootstrapPaperUser(
  db: Env["DB"],
  profile: {
    telegramUserId: string;
    telegramChatId: string;
    username?: string | null;
    displayName?: string | null;
    languageCode?: string | null;
    locale?: SupportedLocale | null;
  },
) {
  const user = await ensureTelegramUser(db, profile);
  await ensurePaperAccountByUserId(db, user.id);
  return getPaperPerformanceSnapshot(db, user.id);
}
