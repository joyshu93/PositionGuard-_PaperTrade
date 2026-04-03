import { assert, assertEqual } from "./test-helpers.js";
import {
  applyPaperFill,
  buildEquitySnapshot,
  calculateBuyFill,
  calculateBuyQuantity,
  calculateSellFill,
  calculateSellQuantity,
} from "../src/paper/math.js";
import {
  buildHourlySummaryMessage,
  renderPaperPnlMessage,
  renderPaperStatusMessage,
} from "../src/paper/reporting.js";
import { runUserHourlyCycle } from "../src/hourly.js";

const account = {
  id: 1,
  userId: 1,
  currency: "KRW" as const,
  initialCash: 1_000_000,
  cashBalance: 1_000_000,
  realizedPnl: 0,
  totalFeesPaid: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const buyQuantity = calculateBuyQuantity(250_000, account.cashBalance, 100_000);
assert(buyQuantity > 0, "Buy quantity should be positive for a valid staged allocation.");

const buyFill = calculateBuyFill("ENTRY", buyQuantity, 100_000);
assert(buyFill !== null, "Buy fill should be created when staged value clears the minimum threshold.");

const afterBuy = applyPaperFill({
  account,
  position: null,
  asset: "BTC",
  market: "KRW-BTC",
  fill: buyFill!,
});

assert(afterBuy.account.cashBalance >= 0, "Paper cash balance must never go negative.");
assert(afterBuy.position !== null && afterBuy.position.quantity > 0, "Paper entry should create a positive position.");

const sellQuantity = calculateSellQuantity(afterBuy.position!.quantity, 1);
const sellFillWin = calculateSellFill("EXIT", sellQuantity, 110_000, afterBuy.position!.averageEntryPrice);
assert(sellFillWin !== null, "Winning sell fill should be created for a valid exit quantity.");

const sellFillLoss = calculateSellFill("EXIT", sellQuantity, 90_000, afterBuy.position!.averageEntryPrice);
assert(sellFillLoss !== null, "Losing sell fill should be created for a valid exit quantity.");

const afterSell = applyPaperFill({
  account: afterBuy.account,
  position: afterBuy.position,
  asset: "BTC",
  market: "KRW-BTC",
  fill: sellFillWin!,
});

assertEqual(afterSell.position.quantity, 0, "Full exit should flatten the paper position.");
assert(afterSell.account.cashBalance >= 0, "Paper cash balance should remain non-negative after exit.");

const equity = buildEquitySnapshot({
  userId: 1,
  account: afterSell.account,
  asset: null,
  positions: {
    BTC: afterSell.position,
    ETH: null,
  },
  latestPrices: {
    BTC: 110_000,
    ETH: null,
  },
});

assert(equity.totalEquity >= 0, "Equity snapshot should keep total equity non-negative.");

const performanceSnapshot = {
  account: afterSell.account,
  positions: {
    BTC: afterSell.position,
    ETH: null,
  },
  latestPrices: {
    BTC: 110_000,
    ETH: null,
  },
  recentTrades: [
    {
      id: 3,
      userId: 1,
      accountId: 1,
      asset: "BTC" as const,
      market: "KRW-BTC" as const,
      side: "SELL" as const,
      action: "EXIT" as const,
      quantity: 1,
      fillPrice: 110_000,
      grossAmount: 110_000,
      feeAmount: 55,
      realizedPnl: 9_945,
      slippageRate: 0.0003,
      note: null,
      createdAt: "2026-01-01T02:00:00.000Z",
    },
  ],
  latestEquity: null,
  totalEquity: equity.totalEquity,
  unrealizedPnl: equity.unrealizedPnl,
  cumulativeReturnPct: equity.totalReturnPct,
  cumulativeClosedTradeCount: 3,
  cumulativeWinningTradeCount: 2,
  cumulativeWinRate: 2 / 3,
  cumulativeRealizedPnlFromTrades: 7_500,
};

assert(
  renderPaperStatusMessage(performanceSnapshot, "en").includes("All fills are simulated paper fills."),
  "Paper status should explicitly say fills are simulated.",
);
assert(
  renderPaperPnlMessage(performanceSnapshot, "en").includes("Total closed trades: 3"),
  "/pnl should show cumulative closed-trade count.",
);
assert(
  renderPaperPnlMessage(performanceSnapshot, "en").includes("Cumulative closed-trade win rate: +66.67%"),
  "/pnl should show cumulative win rate instead of a recent-only rate.",
);
assert(
  renderPaperPnlMessage(performanceSnapshot, "en").includes("Cumulative realized PnL (closed trades): +7,500"),
  "/pnl should distinguish cumulative realized PnL derived from closed trades.",
);

const hourlySummary = buildHourlySummaryMessage({
  btcAction: "ENTRY",
  ethAction: "HOLD",
  snapshot: performanceSnapshot,
  locale: "en",
});
assert(
  hourlySummary.includes("Hourly summary") &&
    hourlySummary.includes("BTC: ENTRY | ETH: HOLD") &&
    hourlySummary.includes("All values reflect simulated paper fills"),
  "Hourly summary should include actions, portfolio metrics, and simulated-fill wording.",
);

let aggregatePersistCalls = 0;
let sentMessages = 0;
await runUserHourlyCycle({
  db: {} as never,
  telegramClient: {
    async sendMessage() {
      sentMessages += 1;
    },
    async answerCallbackQuery() {
      return;
    },
  },
  userState: {
    user: {
      id: 1,
      telegramUserId: "1",
      telegramChatId: "100",
      username: null,
      displayName: null,
      locale: "en",
      trackedAssets: "BTC,ETH",
      sleepModeEnabled: false,
      onboardingComplete: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    accountState: null,
    positions: {},
  },
  upbitBaseUrl: null,
  ensureAccount: async () => account,
  processAssetCycle: async (_db, _client, _userState, asset) => ({
    action: asset === "BTC" ? "ENTRY" : "HOLD",
    executed: asset === "BTC",
    summary: `${asset} summary`,
    reasons: [],
    trade: null,
    updatedAccount: account,
    updatedPosition: null,
    referencePrice: asset === "BTC" ? 100_000 : 3_000_000,
    fillPrice: null,
    latestMarketPrice: asset === "BTC" ? 100_000 : 3_000_000,
  }),
  persistAggregateSnapshot: async () => {
    aggregatePersistCalls += 1;
    return {
      id: 1,
      userId: 1,
      accountId: 1,
      asset: null,
      cashBalance: account.cashBalance,
      positionMarketValue: 0,
      totalEquity: account.cashBalance,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalReturnPct: 0,
      createdAt: "2026-01-01T01:00:00.000Z",
    };
  },
  loadPerformanceSnapshot: async () => performanceSnapshot,
});

assertEqual(
  aggregatePersistCalls,
  1,
  "Aggregate equity snapshot should be created once per user hourly run after both assets are processed.",
);
assertEqual(
  sentMessages,
  1,
  "A single hourly summary should be sent once per user hourly run when sleep mode is off.",
);
