import { assert } from "./test-helpers.js";
import { routeCommand } from "../src/telegram/commands.js";
import { renderPaperPnlMessage } from "../src/paper/reporting.js";
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
  },
  paperTradingProvider: {
    async getStatus(_id: number, locale: "ko" | "en") {
      return locale === "ko" ? "실전 상태" : "Paper status";
    },
    async getPositions(_id: number, locale: "ko" | "en") {
      return locale === "ko" ? "포지션" : "Positions";
    },
    async getPnl(_id: number, locale: "ko" | "en") {
      return locale === "ko" ? "손익" : "Paper PnL";
    },
    async getHistory(_id: number, locale: "ko" | "en") {
      return locale === "ko" ? "최근 거래 내역" : "Recent paper trades";
    },
  },
};

const statusActions = await routeCommand(baseContext, deps);
assert(
  statusActions[0]?.kind === "sendMessage" && statusActions[0].text.includes("Paper status"),
  "/status should render the paper-trading status provider output.",
);

const positionsActions = await routeCommand(
  {
    ...baseContext,
    command: "positions",
    text: "/positions",
  },
  deps,
);
assert(
  positionsActions[0]?.kind === "sendMessage" && positionsActions[0].text.includes("Positions"),
  "/positions should render the focused paper-trading positions provider output.",
);

const pnlActions = await routeCommand(
  {
    ...baseContext,
    command: "pnl",
    text: "/pnl",
  },
  deps,
);
assert(
  pnlActions[0]?.kind === "sendMessage" && pnlActions[0].text.includes("Paper PnL"),
  "/pnl should render the paper-trading PnL provider output.",
);

const historyActions = await routeCommand(
  {
    ...baseContext,
    command: "history",
    text: "/history",
  },
  deps,
);
assert(
  historyActions[0]?.kind === "sendMessage" && historyActions[0].text.includes("Recent paper trades"),
  "/history should render the paper-trading history provider output.",
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

const legacyActions = await routeCommand(
  {
    ...baseContext,
    command: "setcash",
    text: "/setcash 1000",
    args: ["1000"],
  },
  deps,
);
assert(
  legacyActions[0]?.kind === "sendMessage" &&
    legacyActions[0].text.includes("no longer uses manual record-only state commands"),
  "Legacy manual-state commands should explain the new paper-trading boundary.",
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
  koreanStatusActions[0]?.kind === "sendMessage" && koreanStatusActions[0].text.includes("실전 상태"),
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
    koreanPnlMessage.includes("누적 승률") &&
    koreanPnlMessage.includes("저장된 전체 매도 체결 이력"),
  "Korean /pnl messaging should use Korean labels and cumulative-stat wording.",
);
