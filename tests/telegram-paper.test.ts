import { assert } from "./test-helpers.js";
import { routeCommand } from "../src/telegram/commands.js";
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
    async setLocale() {
      return "en" as const;
    },
  },
  paperTradingProvider: {
    async getStatus() {
      return "Paper status";
    },
    async getPnl() {
      return "Paper PnL";
    },
    async getHistory() {
      return "Paper history";
    },
  },
};

const statusActions = await routeCommand(baseContext, deps);
assert(
  statusActions[0]?.kind === "sendMessage" && statusActions[0].text.includes("Paper status"),
  "/status should render the paper-trading status provider output.",
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
  historyActions[0]?.kind === "sendMessage" && historyActions[0].text.includes("Paper history"),
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
