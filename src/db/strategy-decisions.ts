import { parseJson, stringifyJson } from "./db.js";
import type { D1DatabaseLike } from "./db.js";
import type { StrategyDecisionInput, StrategyDecisionRecord } from "../types/persistence.js";

type StrategyDecisionRow = {
  id: number;
  user_id: number;
  asset: "BTC" | "ETH";
  market: "KRW-BTC" | "KRW-ETH";
  action: "HOLD" | "ENTRY" | "ADD" | "REDUCE" | "EXIT";
  execution_status: "EXECUTED" | "SKIPPED";
  summary: string;
  reasons_json: string;
  rationale_json: string | null;
  reference_price: number;
  fill_price: number | null;
  trade_id: number | null;
  created_at: string;
};

const mapStrategyDecisionRow = (row: StrategyDecisionRow): StrategyDecisionRecord => ({
  id: row.id,
  userId: row.user_id,
  asset: row.asset,
  market: row.market,
  action: row.action,
  executionStatus: row.execution_status,
  summary: row.summary,
  reasons: parseJson<string[]>(row.reasons_json, []),
  rationale: parseJson<unknown>(row.rationale_json, null),
  referencePrice: row.reference_price,
  fillPrice: row.fill_price,
  tradeId: row.trade_id,
  createdAt: row.created_at,
});

export async function createStrategyDecision(
  db: D1DatabaseLike,
  input: StrategyDecisionInput,
): Promise<StrategyDecisionRecord> {
  const row = await db
    .prepare(
      `INSERT INTO strategy_decisions (
         user_id, asset, market, action, execution_status, summary, reasons_json,
         rationale_json, reference_price, fill_price, trade_id, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
       RETURNING id, user_id, asset, market, action, execution_status, summary, reasons_json,
         rationale_json, reference_price, fill_price, trade_id, created_at`,
    )
    .bind(
      input.userId,
      input.asset,
      input.market,
      input.action,
      input.executionStatus,
      input.summary,
      stringifyJson(input.reasons),
      stringifyJson(input.rationale),
      input.referencePrice,
      input.fillPrice ?? null,
      input.tradeId ?? null,
      input.createdAt ?? null,
    )
    .first<StrategyDecisionRow>();

  if (!row) {
    throw new Error("Failed to persist strategy decision");
  }

  return mapStrategyDecisionRow(row);
}

export async function listRecentStrategyDecisionsForUser(
  db: D1DatabaseLike,
  userId: number,
  limit = 10,
): Promise<StrategyDecisionRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, user_id, asset, market, action, execution_status, summary, reasons_json,
              rationale_json, reference_price, fill_price, trade_id, created_at
       FROM strategy_decisions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(userId, limit)
    .all<StrategyDecisionRow>();

  return result.results.map(mapStrategyDecisionRow);
}
