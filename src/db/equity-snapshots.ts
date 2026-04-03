import type { D1DatabaseLike } from "./db.js";
import type { EquitySnapshotInput, EquitySnapshotRecord } from "../types/persistence.js";

type EquitySnapshotRow = {
  id: number;
  user_id: number;
  account_id: number;
  asset: "BTC" | "ETH" | null;
  cash_balance: number;
  position_market_value: number;
  total_equity: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_return_pct: number;
  created_at: string;
};

const mapEquitySnapshotRow = (row: EquitySnapshotRow): EquitySnapshotRecord => ({
  id: row.id,
  userId: row.user_id,
  accountId: row.account_id,
  asset: row.asset,
  cashBalance: row.cash_balance,
  positionMarketValue: row.position_market_value,
  totalEquity: row.total_equity,
  realizedPnl: row.realized_pnl,
  unrealizedPnl: row.unrealized_pnl,
  totalReturnPct: row.total_return_pct,
  createdAt: row.created_at,
});

export async function createEquitySnapshot(
  db: D1DatabaseLike,
  input: EquitySnapshotInput,
): Promise<EquitySnapshotRecord> {
  const row = await db
    .prepare(
      `INSERT INTO equity_snapshots (
         user_id, account_id, asset, cash_balance, position_market_value,
         total_equity, realized_pnl, unrealized_pnl, total_return_pct, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
       RETURNING id, user_id, account_id, asset, cash_balance, position_market_value,
         total_equity, realized_pnl, unrealized_pnl, total_return_pct, created_at`,
    )
    .bind(
      input.userId,
      input.accountId,
      input.asset,
      input.cashBalance,
      input.positionMarketValue,
      input.totalEquity,
      input.realizedPnl,
      input.unrealizedPnl,
      input.totalReturnPct,
      input.createdAt ?? null,
    )
    .first<EquitySnapshotRow>();

  if (!row) {
    throw new Error("Failed to persist equity snapshot");
  }

  return mapEquitySnapshotRow(row);
}

export async function getLatestEquitySnapshotForUser(
  db: D1DatabaseLike,
  userId: number,
): Promise<EquitySnapshotRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, user_id, account_id, asset, cash_balance, position_market_value,
              total_equity, realized_pnl, unrealized_pnl, total_return_pct, created_at
       FROM equity_snapshots
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(userId)
    .first<EquitySnapshotRow>();

  return row ? mapEquitySnapshotRow(row) : null;
}
