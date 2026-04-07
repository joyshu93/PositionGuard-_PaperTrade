import {
  createRuntimeConfig,
  assertRuntimeConfig,
  getRuntimeConfigReport,
  type Env,
} from "./env.js";
import { runHourlyCycle } from "./hourly.js";
import { handleTelegramWebhook } from "./telegram.js";
import {
  buildPaperTradingSettingsView,
  ensureTelegramUser,
  getLatestPaperDecisionSnapshot,
  getPaperDailySummary,
  getPaperPerformanceSnapshot,
  listRecentPaperTrades,
  setLocaleByTelegramUserId,
  setNextPaperStartCashByTelegramUserId,
  resetPaperTradingByTelegramUserId,
  setSleepModeByTelegramUserId,
} from "./db/repositories.js";
import {
  renderPaperDailyMessage,
  renderPaperDecisionMessage,
  renderPaperHistoryMessage,
  renderPaperPnlMessage,
  renderPaperPositionsMessage,
  renderPaperSettingsMessage,
  renderPaperStatusMessage,
} from "./paper/reporting.js";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

export default {
  async fetch(request, env, ctx) {
    return handleFetch(request, env, ctx);
  },
  async scheduled(_controller, env, _ctx) {
    assertRuntimeConfig(env, "scheduled");
    await runHourlyCycle(env);
  },
} satisfies ExportedHandler<Env>;

async function handleFetch(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const report = getRuntimeConfigReport(env, "webhook");

  if (request.method === "GET" && url.pathname === "/") {
    return jsonResponse({
      ok: true,
      service: "position-guard-papertrade",
      scope: "telegram btc/eth paper-trading bot",
      webhookPath: report.webhookPath,
      healthPath: report.healthPath,
    });
  }

  if (request.method === "GET" && url.pathname === report.healthPath) {
    return jsonResponse(
      {
        ok: report.ok,
        status: report.ok ? "healthy" : "misconfigured",
        service: "position-guard-papertrade",
        errors: report.errors,
      },
      report.ok ? 200 : 500,
    );
  }

  if (url.pathname === report.webhookPath) {
    const runtime = createRuntimeConfig(env);

    return handleTelegramWebhook(request, {
      env: {
        TELEGRAM_BOT_TOKEN: runtime.telegramBotToken,
        ...(runtime.telegramWebhookSecret
          ? { TELEGRAM_WEBHOOK_SECRET: runtime.telegramWebhookSecret }
          : {}),
      },
      deps: {
        stateStore: {
          async getUserState(telegramUserId) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            }, runtime.paperTradingSettings.values.initialPaperCashKrw);
            return {
              telegramUserId,
              isSleeping: user.sleepModeEnabled,
              cash: null,
              trackedAssets: user.trackedAssets,
              locale: user.locale ?? null,
            };
          },
          async upsertUserState(input) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(input.telegramUserId),
              telegramChatId: String(input.telegramChatId),
              username: input.username ?? null,
              displayName: input.displayName ?? null,
              languageCode: input.languageCode ?? null,
              locale: input.preferredLocale ?? null,
            }, runtime.paperTradingSettings.values.initialPaperCashKrw);
            return user.locale ?? null;
          },
          async setCash() {
            return;
          },
          async setPosition() {
            return;
          },
          async setSleepMode(telegramUserId, isSleeping) {
            await setSleepModeByTelegramUserId(env.DB, String(telegramUserId), isSleeping);
          },
          async setLocale(telegramUserId, locale) {
            const user = await setLocaleByTelegramUserId(env.DB, String(telegramUserId), locale);
            return user.locale ?? locale;
          },
          async setNextPaperStartCash(telegramUserId, amount) {
            const user = await setNextPaperStartCashByTelegramUserId(
              env.DB,
              String(telegramUserId),
              amount,
            );
            return user.nextPaperStartCash;
          },
          async resetPaperTrading(telegramUserId) {
            const result = await resetPaperTradingByTelegramUserId(
              env.DB,
              String(telegramUserId),
              runtime.paperTradingSettings.values.initialPaperCashKrw,
            );
            return { startingCash: result.startingCash };
          },
        },
        paperTradingProvider: {
          async getStatus(telegramUserId, locale) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            }, runtime.paperTradingSettings.values.initialPaperCashKrw);
            const snapshot = await getPaperPerformanceSnapshot(
              env.DB,
              user.id,
              runtime.paperTradingSettings.values.initialPaperCashKrw,
            );
            return renderPaperStatusMessage(snapshot, locale);
          },
          async getPositions(telegramUserId, locale) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            }, runtime.paperTradingSettings.values.initialPaperCashKrw);
            const snapshot = await getPaperPerformanceSnapshot(
              env.DB,
              user.id,
              runtime.paperTradingSettings.values.initialPaperCashKrw,
            );
            return renderPaperPositionsMessage(snapshot, locale);
          },
          async getPnl(telegramUserId, locale) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            }, runtime.paperTradingSettings.values.initialPaperCashKrw);
            const snapshot = await getPaperPerformanceSnapshot(
              env.DB,
              user.id,
              runtime.paperTradingSettings.values.initialPaperCashKrw,
            );
            return renderPaperPnlMessage(snapshot, locale);
          },
          async getHistory(telegramUserId, locale) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            }, runtime.paperTradingSettings.values.initialPaperCashKrw);
            const trades = await listRecentPaperTrades(env.DB, user.id, 8);
            return renderPaperHistoryMessage(trades, locale);
          },
          async getSettings(telegramUserId, locale) {
            await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            }, runtime.paperTradingSettings.values.initialPaperCashKrw);
            return renderPaperSettingsMessage(
              buildPaperTradingSettingsView(
                runtime.paperTradingSettings.values,
                runtime.paperTradingSettings.sourceByField,
              ),
              locale,
            );
          },
          async getDecision(telegramUserId, locale) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            }, runtime.paperTradingSettings.values.initialPaperCashKrw);
            const snapshot = await getLatestPaperDecisionSnapshot(env.DB, user.id);
            return renderPaperDecisionMessage(snapshot, locale);
          },
          async getDaily(telegramUserId, locale) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            }, runtime.paperTradingSettings.values.initialPaperCashKrw);
            const performance = await getPaperPerformanceSnapshot(
              env.DB,
              user.id,
              runtime.paperTradingSettings.values.initialPaperCashKrw,
            );
            const dailySummary = await getPaperDailySummary(
              env.DB,
              user.id,
              performance.totalEquity,
            );
            return renderPaperDailyMessage(dailySummary, locale);
          },
        },
      },
    });
  }

  return jsonResponse({ ok: false, error: "Not found" }, 404);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}
