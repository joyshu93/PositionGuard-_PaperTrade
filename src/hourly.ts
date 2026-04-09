import { createRuntimeConfig, type Env } from "./env.js";
import type {
  PaperExecutionResult,
  PaperPerformanceSnapshot,
  PaperTradingSettings,
  SupportedAsset,
  SupportedLocale,
  SupportedMarket,
  UserStateBundle,
} from "./domain/types.js";
import { createTelegramBotClient } from "./telegram/client.js";
import { getMarketForAsset, getMarketSnapshotResult, type MarketSnapshotResult } from "./upbit.js";
import {
  createAggregateEquitySnapshot,
  createPaperTradeRecord,
  createStrategyDecisionRecord,
  ensurePaperAccountByUserId,
  ensureTelegramUser,
  getLatestExitTradeByUserAsset,
  getLatestStrategyDecisionByUserAsset,
  getPaperPerformanceSnapshot,
  getPaperPositionSnapshotByUserAsset,
  listPaperPositionSnapshotsForUser,
  listUsersForHourlyRun,
  savePaperAccountSnapshot,
  savePaperPositionSnapshot,
} from "./db/repositories.js";
import { buildExecutionSummary, buildHourlySummaryMessage } from "./paper/reporting.js";
import { decidePaperTrade } from "./paper/strategy.js";
import {
  applyPaperFill,
  calculatePositionMarketValue,
  calculateBuyFill,
  calculateBuyQuantity,
  calculateSellFill,
  calculateSellQuantity,
  getPaperBuyFillPrice,
} from "./paper/math.js";
import { DEFAULT_PAPER_TRADING_SETTINGS } from "./paper/config.js";
import { resolveUserLocale } from "./i18n/index.js";

const SUPPORTED_ASSETS: SupportedAsset[] = ["BTC", "ETH"];
const SUPPORTED_MARKETS_BY_ASSET: Record<SupportedAsset, SupportedMarket> = {
  BTC: "KRW-BTC",
  ETH: "KRW-ETH",
};
export type HourlyMarketSnapshotBatch = Record<SupportedAsset, MarketSnapshotResult>;

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
      paperTradingSettings: runtime.paperTradingSettings.values,
    });
  }
}

export async function runUserHourlyCycle(params: {
  db: Env["DB"];
  telegramClient: ReturnType<typeof createTelegramBotClient>;
  userState: UserStateBundle;
  upbitBaseUrl: string | null;
  paperTradingSettings?: PaperTradingSettings;
  ensureAccount?: typeof ensurePaperAccountByUserId;
  processAssetCycle?: typeof processPaperTradingCycle;
  fetchMarketSnapshots?: typeof fetchHourlyMarketSnapshots;
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
    paperTradingSettings,
    ensureAccount = ensurePaperAccountByUserId,
    processAssetCycle = processPaperTradingCycle,
    fetchMarketSnapshots = fetchHourlyMarketSnapshots,
    persistAggregateSnapshot = createAggregateEquitySnapshot,
    loadPerformanceSnapshot = getPaperPerformanceSnapshot,
  } = params;

  await ensureAccount(db, userState.user.id, paperTradingSettings?.initialPaperCashKrw);

  const assetResults: UserHourlyAssetResult[] = [];
  const marketSnapshotResults = await fetchMarketSnapshots(upbitBaseUrl);
  for (const asset of SUPPORTED_ASSETS) {
    const market = SUPPORTED_MARKETS_BY_ASSET[asset];
    const execution = await processAssetCycle(
      db,
      telegramClient,
      userState,
      asset,
      market,
      marketSnapshotResults[asset],
      paperTradingSettings,
      marketSnapshotResults,
    );
    assetResults.push({ asset, execution });
  }

  const account = await ensureAccount(
    db,
    userState.user.id,
    paperTradingSettings?.initialPaperCashKrw,
  );
  await persistAggregateSnapshot(db, userState.user.id, account, null);
  const performanceSnapshot = await loadPerformanceSnapshot(
    db,
    userState.user.id,
    paperTradingSettings?.initialPaperCashKrw,
  );

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
  marketResultOrBaseUrl: MarketSnapshotResult | string | null = null,
  paperTradingSettings: PaperTradingSettings = DEFAULT_PAPER_TRADING_SETTINGS,
  marketBatch: Partial<HourlyMarketSnapshotBatch> | null = null,
): Promise<PaperExecutionResult> {
  const marketResult =
    typeof marketResultOrBaseUrl === "string" || marketResultOrBaseUrl === null
      ? await getMarketSnapshotResult(marketResultOrBaseUrl ?? undefined, market)
      : marketResultOrBaseUrl;
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
        marketTiming: null,
      },
      referencePrice: 0,
      fillPrice: null,
      tradeId: null,
    });

    return {
      action: skipped.action,
      executed: false,
      executionDisposition: "SKIPPED",
      summary: skipped.summary,
      reasons: skipped.reasons,
      trade: null,
      updatedAccount: await ensurePaperAccountByUserId(
        db,
        userState.user.id,
        paperTradingSettings.initialPaperCashKrw,
      ),
      updatedPosition: await getPaperPositionSnapshotByUserAsset(db, userState.user.id, asset),
      referencePrice: 0,
      fillPrice: null,
      latestMarketPrice: null,
    };
  }

  const locale = resolveUserLocale(userState.user.locale ?? null);
  const account = await ensurePaperAccountByUserId(
    db,
    userState.user.id,
    paperTradingSettings.initialPaperCashKrw,
  );
  const position = await getPaperPositionSnapshotByUserAsset(db, userState.user.id, asset);
  const [allPositions, latestDecision, latestExitTrade] = await Promise.all([
    listPaperPositionSnapshotsForUser(db, userState.user.id),
    getLatestStrategyDecisionByUserAsset(db, userState.user.id, asset),
    getLatestExitTradeByUserAsset(db, userState.user.id, asset),
  ]);
  const currentPrices = resolvePortfolioMarkPrices(
    asset,
    marketResult.snapshot.ticker.tradePrice,
    allPositions,
    marketBatch,
  );
  const totalExposureValue =
    calculatePositionMarketValue(allPositions.BTC, currentPrices.BTC) +
    calculatePositionMarketValue(allPositions.ETH, currentPrices.ETH);
  const assetMarketValue = calculatePositionMarketValue(position, currentPrices[asset]);
  const nowIso = new Date().toISOString();
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
    portfolio: {
      totalEquity: account.cashBalance + totalExposureValue,
      assetMarketValue,
      totalExposureValue,
      assetExposureRatio:
        account.cashBalance + totalExposureValue > 0
          ? assetMarketValue / (account.cashBalance + totalExposureValue)
          : 0,
      totalExposureRatio:
        account.cashBalance + totalExposureValue > 0
          ? totalExposureValue / (account.cashBalance + totalExposureValue)
          : 0,
    },
    latestDecision,
    recentExit: {
      tradeId: latestExitTrade?.id ?? null,
      createdAt: latestExitTrade?.createdAt ?? null,
      hoursSinceExit: latestExitTrade
        ? Math.max(0, (new Date(nowIso).getTime() - new Date(latestExitTrade.createdAt).getTime()) / 3_600_000)
        : null,
      realizedPnl: latestExitTrade?.realizedPnl ?? null,
    },
    marketSnapshot: marketResult.snapshot,
    generatedAt: nowIso,
    settings: paperTradingSettings,
  };
  const decision = decidePaperTrade(context);
  const execution = await executePaperDecision(db, {
    userId: userState.user.id,
    asset,
    market,
    account,
    position,
    decision,
    settings: paperTradingSettings,
  });

  await createStrategyDecisionRecord(db, {
    userId: userState.user.id,
    asset,
    market,
    action: decision.action,
    executionStatus: execution.executed ? "EXECUTED" : "SKIPPED",
    summary: execution.summary,
    reasons: execution.reasons,
    rationale: {
      diagnostics: decision.diagnostics,
      executionDisposition: execution.executionDisposition,
      signalQuality: decision.signalQuality,
      exposureGuardrails: decision.exposureGuardrails,
      marketTiming: {
        snapshotFetchedAt: marketResult.snapshot.fetchedAt,
        tickerFetchedAt: marketResult.snapshot.ticker.fetchedAt,
        tickerTradeTimeUtc: marketResult.snapshot.ticker.tradeTimeUtc,
        tickerTradeTimeKst: marketResult.snapshot.ticker.tradeTimeKst,
        tickerExchangeTimestampMs: marketResult.snapshot.ticker.exchangeTimestampMs,
        latestHourlyOpenTime: marketResult.snapshot.timeframes["1h"].candles.at(-1)?.openTime ?? null,
        latestHourlyCloseTime: marketResult.snapshot.timeframes["1h"].candles.at(-1)?.closeTime ?? null,
        latestFourHourOpenTime: marketResult.snapshot.timeframes["4h"].candles.at(-1)?.openTime ?? null,
        latestFourHourCloseTime: marketResult.snapshot.timeframes["4h"].candles.at(-1)?.closeTime ?? null,
        latestDailyOpenTime: marketResult.snapshot.timeframes["1d"].candles.at(-1)?.openTime ?? null,
        latestDailyCloseTime: marketResult.snapshot.timeframes["1d"].candles.at(-1)?.closeTime ?? null,
      },
    },
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
    const snapshot = await getPaperPerformanceSnapshot(
      db,
      userState.user.id,
      paperTradingSettings.initialPaperCashKrw,
    );
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
    settings: PaperTradingSettings;
  },
): Promise<PaperExecutionResult> {
  const { account, position, asset, market, decision, settings } = params;

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
      executionDisposition: "SKIPPED",
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

  if (decision.executionDisposition === "DEFERRED_CONFIRMATION") {
    if (position) {
      await savePaperPositionSnapshot(db, {
        ...position,
        lastMarkPrice: decision.referencePrice,
      });
    }

    return {
      action: decision.action,
      executed: false,
      executionDisposition: "DEFERRED_CONFIRMATION",
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
            getPaperBuyFillPrice(decision.referencePrice, settings),
            settings,
          ),
          decision.referencePrice,
          settings,
        )
      : calculateSellFill(
          decision.action,
          calculateSellQuantity(position?.quantity ?? 0, decision.targetQuantityFraction ?? 0),
          decision.referencePrice,
          position?.averageEntryPrice ?? 0,
          settings,
        );

  if (!fill) {
    return {
      action: decision.action,
      executed: false,
      executionDisposition: "SKIPPED",
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
    executionDisposition: decision.executionDisposition,
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

async function fetchHourlyMarketSnapshots(
  upbitBaseUrl: string | null,
): Promise<HourlyMarketSnapshotBatch> {
  const entries = await Promise.all(
    SUPPORTED_ASSETS.map(async (asset) => {
      const market = getMarketForAsset(asset);
      const result = await getMarketSnapshotResult(upbitBaseUrl ?? undefined, market);
      return [asset, result] as const;
    }),
  );

  return Object.fromEntries(entries) as HourlyMarketSnapshotBatch;
}

export function resolvePortfolioMarkPrices(
  asset: SupportedAsset,
  currentAssetPrice: number,
  positions: Record<SupportedAsset, { lastMarkPrice: number | null } | null>,
  marketBatch: Partial<HourlyMarketSnapshotBatch> | null,
): Record<SupportedAsset, number | null> {
  const batchPrices: Record<SupportedAsset, number | null> = {
    BTC: marketBatch?.BTC?.ok ? marketBatch.BTC.snapshot.ticker.tradePrice : null,
    ETH: marketBatch?.ETH?.ok ? marketBatch.ETH.snapshot.ticker.tradePrice : null,
  };

  return {
    BTC: batchPrices.BTC ?? (asset === "BTC" ? currentAssetPrice : positions.BTC?.lastMarkPrice ?? null),
    ETH: batchPrices.ETH ?? (asset === "ETH" ? currentAssetPrice : positions.ETH?.lastMarkPrice ?? null),
  };
}
