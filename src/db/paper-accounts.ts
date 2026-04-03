import { nowIso } from "./db.js";
import type { D1DatabaseLike } from "./db.js";
import type { PaperAccountRecord } from "../types/persistence.js";

type PaperAccountRow = {
  id: number;
  user_id: number;
  currency: "KRW";
  initial_cash: number;
  cash_balance: number;
  realized_pnl: number;
  total_fees_paid: number;
  created_at: string;
  updated_at: string;
};

const mapPaperAccountRow = (row: PaperAccountRow): PaperAccountRecord => ({
  id: row.id,
  userId: row.user_id,
  currency: row.currency,
  initialCash: row.initial_cash,
  cashBalance: row.cash_balance,
  realizedPnl: row.realized_pnl,
  totalFeesPaid: row.total_fees_paid,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function getPaperAccountByUserId(
  db: D1DatabaseLike,
  userId: number,
): Promise<PaperAccountRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, user_id, currency, initial_cash, cash_balance, realized_pnl, total_fees_paid, created_at, updated_at
       FROM paper_accounts
       WHERE user_id = ?`,
    )
    .bind(userId)
    .first<PaperAccountRow>();

  return row ? mapPaperAccountRow(row) : null;
}

export async function ensurePaperAccountForUser(
  db: D1DatabaseLike,
  userId: number,
  initialCash: number,
): Promise<PaperAccountRecord> {
  const existing = await getPaperAccountByUserId(db, userId);
  if (existing) {
    return existing;
  }

  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO paper_accounts (user_id, currency, initial_cash, cash_balance, realized_pnl, total_fees_paid, created_at, updated_at)
       VALUES (?, 'KRW', ?, ?, 0, 0, ?, ?)`,
    )
    .bind(userId, initialCash, initialCash, timestamp, timestamp)
    .run();

  const created = await getPaperAccountByUserId(db, userId);
  if (!created) {
    throw new Error("Failed to create paper account");
  }

  return created;
}

export async function savePaperAccount(
  db: D1DatabaseLike,
  account: PaperAccountRecord,
): Promise<PaperAccountRecord> {
  const timestamp = nowIso();
  await db
    .prepare(
      `UPDATE paper_accounts
       SET cash_balance = ?, realized_pnl = ?, total_fees_paid = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      account.cashBalance,
      account.realizedPnl,
      account.totalFeesPaid,
      timestamp,
      account.id,
    )
    .run();

  const updated = await getPaperAccountByUserId(db, account.userId);
  if (!updated) {
    throw new Error("Failed to refresh paper account");
  }

  return updated;
}
