import {
  createRuntimeConfig,
  assertRuntimeConfig,
  getRuntimeConfigReport,
  type Env,
} from "./env.js";
import { runHourlyCycle } from "./hourly.js";
import { handleTelegramWebhook } from "./telegram.js";
import {
  ensureTelegramUser,
  getPaperPerformanceSnapshot,
  listRecentPaperTrades,
  setLocaleByTelegramUserId,
  setSleepModeByTelegramUserId,
} from "./db/repositories.js";
import {
  renderPaperHistoryMessage,
  renderPaperPnlMessage,
  renderPaperPositionsMessage,
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
            });
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
            });
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
        },
        paperTradingProvider: {
          async getStatus(telegramUserId, locale) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            });
            const snapshot = await getPaperPerformanceSnapshot(env.DB, user.id);
            return renderPaperStatusMessage(snapshot, locale);
          },
          async getPositions(telegramUserId, locale) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            });
            const snapshot = await getPaperPerformanceSnapshot(env.DB, user.id);
            return renderPaperPositionsMessage(snapshot, locale);
          },
          async getPnl(telegramUserId, locale) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            });
            const snapshot = await getPaperPerformanceSnapshot(env.DB, user.id);
            return renderPaperPnlMessage(snapshot, locale);
          },
          async getHistory(telegramUserId, locale) {
            const user = await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            });
            const trades = await listRecentPaperTrades(env.DB, user.id, 8);
            return renderPaperHistoryMessage(trades, locale);
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
