import { stringifyJson } from "./db.js";
import type { D1DatabaseLike } from "./db.js";
import type { PaperTradeInput, PaperTradeRecord } from "../types/persistence.js";

type PaperTradeRow = {
  id: number;
  user_id: number;
  account_id: number;
  asset: "BTC" | "ETH";
  market: "KRW-BTC" | "KRW-ETH";
  side: "BUY" | "SELL";
  action: "ENTRY" | "ADD" | "REDUCE" | "EXIT";
  quantity: number;
  fill_price: number;
  gross_amount: number;
  fee_amount: number;
  realized_pnl: number;
  slippage_rate: number;
  note: string | null;
  created_at: string;
};

const mapPaperTradeRow = (row: PaperTradeRow): PaperTradeRecord => ({
  id: row.id,
  userId: row.user_id,
  accountId: row.account_id,
  asset: row.asset,
  market: row.market,
  side: row.side,
  action: row.action,
  quantity: row.quantity,
  fillPrice: row.fill_price,
  grossAmount: row.gross_amount,
  feeAmount: row.fee_amount,
  realizedPnl: row.realized_pnl,
  slippageRate: row.slippage_rate,
  note: row.note,
  createdAt: row.created_at,
});

export async function createPaperTrade(
  db: D1DatabaseLike,
  input: PaperTradeInput,
): Promise<PaperTradeRecord> {
  const row = await db
    .prepare(
      `INSERT INTO paper_trades (
         user_id, account_id, asset, market, side, action, quantity, fill_price,
         gross_amount, fee_amount, realized_pnl, slippage_rate, note, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
       RETURNING id, user_id, account_id, asset, market, side, action, quantity, fill_price,
         gross_amount, fee_amount, realized_pnl, slippage_rate, note, created_at`,
    )
    .bind(
      input.userId,
      input.accountId,
      input.asset,
      input.market,
      input.side,
      input.action,
      input.quantity,
      input.fillPrice,
      input.grossAmount,
      input.feeAmount,
      input.realizedPnl,
      input.slippageRate,
      input.note ?? null,
      input.createdAt ?? null,
    )
    .first<PaperTradeRow>();

  if (!row) {
    throw new Error("Failed to persist paper trade");
  }

  return mapPaperTradeRow(row);
}

export async function listRecentPaperTradesForUser(
  db: D1DatabaseLike,
  userId: number,
  limit = 10,
): Promise<PaperTradeRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, user_id, account_id, asset, market, side, action, quantity, fill_price,
              gross_amount, fee_amount, realized_pnl, slippage_rate, note, created_at
       FROM paper_trades
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(userId, limit)
    .all<PaperTradeRow>();

  return result.results.map(mapPaperTradeRow);
}
