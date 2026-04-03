import { nowIso } from "./db.js";
import type { D1DatabaseLike } from "./db.js";
import type { AssetSymbol, PaperPositionRecord } from "../types/persistence.js";

type PaperPositionRow = {
  id: number;
  user_id: number;
  asset: AssetSymbol;
  market: "KRW-BTC" | "KRW-ETH";
  quantity: number;
  average_entry_price: number;
  last_mark_price: number | null;
  realized_pnl: number;
  created_at: string;
  updated_at: string;
};

const mapPaperPositionRow = (row: PaperPositionRow): PaperPositionRecord => ({
  id: row.id,
  userId: row.user_id,
  asset: row.asset,
  market: row.market,
  quantity: row.quantity,
  averageEntryPrice: row.average_entry_price,
  lastMarkPrice: row.last_mark_price,
  realizedPnl: row.realized_pnl,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function getPaperPositionByUserAsset(
  db: D1DatabaseLike,
  userId: number,
  asset: AssetSymbol,
): Promise<PaperPositionRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, user_id, asset, market, quantity, average_entry_price, last_mark_price, realized_pnl, created_at, updated_at
       FROM paper_positions
       WHERE user_id = ? AND asset = ?`,
    )
    .bind(userId, asset)
    .first<PaperPositionRow>();

  return row ? mapPaperPositionRow(row) : null;
}

export async function listPaperPositionsForUser(
  db: D1DatabaseLike,
  userId: number,
): Promise<PaperPositionRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, user_id, asset, market, quantity, average_entry_price, last_mark_price, realized_pnl, created_at, updated_at
       FROM paper_positions
       WHERE user_id = ?
       ORDER BY asset ASC`,
    )
    .bind(userId)
    .all<PaperPositionRow>();

  return result.results.map(mapPaperPositionRow);
}

export async function savePaperPosition(
  db: D1DatabaseLike,
  input: PaperPositionRecord,
): Promise<PaperPositionRecord> {
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO paper_positions (
         user_id, asset, market, quantity, average_entry_price, last_mark_price, realized_pnl, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
       ON CONFLICT(user_id, asset) DO UPDATE SET
         market = excluded.market,
         quantity = excluded.quantity,
         average_entry_price = excluded.average_entry_price,
         last_mark_price = excluded.last_mark_price,
         realized_pnl = excluded.realized_pnl,
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.userId,
      input.asset,
      input.market,
      input.quantity,
      input.averageEntryPrice,
      input.lastMarkPrice,
      input.realizedPnl,
      input.createdAt,
      timestamp,
    )
    .run();

  const saved = await getPaperPositionByUserAsset(db, input.userId, input.asset);
  if (!saved) {
    throw new Error("Failed to persist paper position");
  }

  return saved;
}
