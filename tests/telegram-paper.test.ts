import { assert } from "./test-helpers.js";
import { routeCommand } from "../src/telegram/commands.js";
import {
  getLocalizedPaperActionLabel,
  renderPaperPnlMessage,
} from "../src/paper/reporting.js";
import type { TelegramCommandContext } from "../src/telegram/types.js";

const baseContext: TelegramCommandContext = {
  update: { update_id: 1 },
  chatId: 200,
  userId: 100,
  profile: {
    telegramUserId: 100,
    telegramChatId: 200,
    username: "tester",
    displayName: "Test User",
  },
  text: "/status",
  command: "status",
  args: [],
};

const deps = {
  stateStore: {
    async getUserState() {
      return null;
    },
    async upsertUserState() {
      return "en" as const;
    },
    async setCash() {
      return;
    },
    async setPosition() {
      return;
    },
    async setSleepMode() {
      return;
    },
    async setLocale(_id: number, locale: "ko" | "en") {
      return locale;
    },
    async setNextPaperStartCash(_id: number, amount: number | null) {
      return amount;
    },
    async resetPaperTrading() {
      return { startingCash: 3_000_000 };
    },
  },
  paperTradingProvider: {
    async getStatus(_id: number, locale: "ko" | "en") {
      return locale === "ko" ? "페이퍼 상태" : "Paper status";
    },
    async getPositions(_id: number, locale: "ko" | "en") {
      return locale === "ko" ? "포지션" : "Positions";
    },
    async getPnl(_id: number, locale: "ko" | "en") {
      return locale === "ko" ? "손익" : "Paper PnL";
    },
    async getHistory(_id: number, locale: "ko" | "en") {
      return locale === "ko" ? "최근 체결" : "Recent paper trades";
    },
    async getSettings(_id: number, locale: "ko" | "en") {
      return locale === "ko" ? "설정" : "Settings";
    },
    async getDecision(_id: number, locale: "ko" | "en") {
      return locale === "ko" ? "최근 결정" : "Latest decisions";
    },
    async getDaily(_id: number, locale: "ko" | "en") {
      return locale === "ko" ? "일간 요약" : "Daily summary";
    },
  },
};

const statusActions = await routeCommand(baseContext, deps);
assert(
  statusActions[0]?.kind === "sendMessage" && statusActions[0].text.includes("Paper status"),
  "/status should render the paper-trading status provider output.",
);

const startActions = await routeCommand(
  {
    ...baseContext,
    command: "start",
    text: "/start",
  },
  deps,
);
assert(
  startActions[0]?.kind === "sendMessage" &&
    startActions[0].text.includes("automatic BTC/ETH-only paper-trading Telegram bot"),
  "/start should explain the automatic paper-trading boundary.",
);
assert(
  startActions[0]?.kind === "sendMessage" &&
    startActions[0].replyMarkup?.inline_keyboard.length === 3,
  "/start should expose the main operator views as Telegram buttons.",
);

const callbackActions = await routeCommand(
  {
    ...baseContext,
    command: "callback",
    text: "nav:settings",
    replyToCallback: {
      id: "cb-1",
      from: { id: 100 },
      data: "nav:settings",
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 200, type: "private" },
        text: "/start",
      },
    },
  },
  deps,
);
assert(
  callbackActions[0]?.kind === "answerCallbackQuery" &&
    callbackActions[1]?.kind === "sendMessage" &&
    callbackActions[1].text.includes("Settings"),
  "Start-menu callbacks should acknowledge the button tap and open the target view.",
);

const settingsActions = await routeCommand(
  {
    ...baseContext,
    command: "settings",
    text: "/settings",
  },
  deps,
);
assert(
  settingsActions[0]?.kind === "sendMessage" && settingsActions[0].text.includes("Settings"),
  "/settings should render the active settings output.",
);

const setStartCashActions = await routeCommand(
  {
    ...baseContext,
    command: "setstartcash",
    text: "/setstartcash 3000000",
    args: ["3000000"],
  },
  deps,
);
assert(
  setStartCashActions[0]?.kind === "sendMessage" &&
    setStartCashActions[0].text.includes("3,000,000 KRW") &&
    setStartCashActions[0].text.includes("next /resetpaper confirm"),
  "/setstartcash should confirm that the new starting cash will apply on the next reset only.",
);

const resetPromptActions = await routeCommand(
  {
    ...baseContext,
    command: "resetpaper",
    text: "/resetpaper",
    args: [],
  },
  deps,
);
assert(
  resetPromptActions[0]?.kind === "sendMessage" &&
    resetPromptActions[0].text.includes("/resetpaper confirm"),
  "/resetpaper should require an explicit confirm step before wiping paper-trading history.",
);

const resetConfirmActions = await routeCommand(
  {
    ...baseContext,
    command: "resetpaper",
    text: "/resetpaper confirm",
    args: ["confirm"],
  },
  deps,
);
assert(
  resetConfirmActions[0]?.kind === "sendMessage" &&
    resetConfirmActions[0].text.includes("Paper account reset completed.") &&
    resetConfirmActions[0].text.includes("3,000,000 KRW"),
  "/resetpaper confirm should report that a fresh paper account was started with the selected starting cash.",
);

const koreanStatusActions = await routeCommand(
  {
    ...baseContext,
    profile: {
      ...baseContext.profile,
      languageCode: "ko-KR",
    },
  },
  {
    ...deps,
    stateStore: {
      ...deps.stateStore,
      async upsertUserState() {
        return "ko" as const;
      },
    },
  },
);
assert(
  koreanStatusActions[0]?.kind === "sendMessage" && koreanStatusActions[0].text.includes("페이퍼 상태"),
  "/status should render Korean output when locale is ko.",
);

const koreanPnlMessage = renderPaperPnlMessage(
  {
    account: {
      id: 1,
      userId: 1,
      currency: "KRW",
      initialCash: 1_000_000,
      cashBalance: 1_050_000,
      realizedPnl: 20_000,
      totalFeesPaid: 500,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    positions: { BTC: null, ETH: null },
    latestPrices: { BTC: null, ETH: null },
    recentTrades: [],
    latestEquity: null,
    totalEquity: 1_050_000,
    unrealizedPnl: 0,
    cumulativeReturnPct: 5,
    cumulativeClosedTradeCount: 4,
    cumulativeWinningTradeCount: 3,
    cumulativeWinRate: 0.75,
    cumulativeRealizedPnlFromTrades: 20_000,
  },
  "ko",
);
assert(
  koreanPnlMessage.includes("손익") &&
    koreanPnlMessage.includes("누적 종료 거래 승률") &&
    koreanPnlMessage.includes("저장된 전체 종료 매도 체결 이력"),
  "Korean /pnl messaging should use Korean labels and cumulative-stat wording.",
);

assert(
  getLocalizedPaperActionLabel("ko", "ENTRY") === "진입" &&
    getLocalizedPaperActionLabel("en", "REDUCE") === "Reduce",
  "Localized action labels should expose operator-friendly action wording in both locales.",
);
