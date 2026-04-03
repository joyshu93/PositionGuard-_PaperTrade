import { assert, assertEqual } from "./test-helpers.js";
import {
  applyPaperFill,
  buildEquitySnapshot,
  calculateBuyFill,
  calculateBuyQuantity,
  calculateSellFill,
  calculateSellQuantity,
} from "../src/paper/math.js";
import { renderPaperPnlMessage, renderPaperStatusMessage } from "../src/paper/reporting.js";

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
const sellFill = calculateSellFill(
  "EXIT",
  sellQuantity,
  110_000,
  afterBuy.position!.averageEntryPrice,
);
assert(sellFill !== null, "Sell fill should be created for a valid exit quantity.");

const afterSell = applyPaperFill({
  account: afterBuy.account,
  position: afterBuy.position,
  asset: "BTC",
  market: "KRW-BTC",
  fill: sellFill!,
});

assertEqual(afterSell.position?.quantity ?? 0, 0, "Full exit should flatten the paper position.");
assert(afterSell.account.cashBalance >= 0, "Paper cash balance should remain non-negative after exit.");

const equity = buildEquitySnapshot({
  userId: 1,
  account: afterSell.account,
  asset: "BTC",
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
  recentTrades: [],
  latestEquity: null,
  totalEquity: equity.totalEquity,
  unrealizedPnl: equity.unrealizedPnl,
  cumulativeReturnPct: equity.totalReturnPct,
  winRate: 1,
};

assert(
  renderPaperStatusMessage(performanceSnapshot, "en").includes("All fills are simulated paper fills."),
  "Paper status should explicitly say fills are simulated.",
);
assert(
  renderPaperPnlMessage(performanceSnapshot, "en").includes("Performance is derived from persisted paper account"),
  "Paper PnL should describe that performance comes from persisted paper state.",
);
