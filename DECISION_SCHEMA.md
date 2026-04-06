# DECISION_SCHEMA.md

## Purpose

This document defines the inspectable decision boundary for the paper-trading version of PositionGuard.

The engine is rule-based, deterministic, spot-only in product framing, and limited to internal simulated execution.

## Product Stage

At this stage the repository may implement:

- typed paper-trading decision contracts
- context assembly from persisted paper account state plus public Upbit market data
- deterministic regime and invalidation-aware rule checks
- internal simulated fill logic
- persistence for paper trades, equity, and strategy decisions
- concise Telegram reporting for simulated executions and cumulative performance
- global paper-trading settings resolution with explicit defaults and optional env overrides

At this stage the repository must not implement:

- authenticated exchange execution
- exchange API key storage
- private account synchronization
- discretionary LLM judgment
- opaque predictive scoring

## Supported Scope

- markets: `KRW-BTC`, `KRW-ETH`
- venue data source: public Upbit quotation and candles only
- product framing: spot-only paper trading
- actions: `HOLD`, `ENTRY`, `ADD`, `REDUCE`, `EXIT`

## Decision Flow

1. Load persisted paper account and paper position state.
2. Fetch public market snapshot for the target asset.
3. Normalize ticker and `1h` / `4h` / `1d` candles.
4. Build a typed paper-trading context.
5. Analyze market structure.
6. Apply deterministic action rules.
7. If action is not `HOLD`, calculate a simulated fill using explicit fee and slippage assumptions.
8. Persist updated paper account, position, trade, equity snapshot, and strategy decision state.
9. Send Telegram execution summary when a simulated fill occurs.

## Decision Input Shape

The paper-trading decision engine receives:

### User Context

- telegram user id
- telegram chat id if available
- locale
- sleep mode flag

### Paper Account State

- initial cash
- cash balance
- cumulative realized pnl
- cumulative fees

### Paper Position State

- asset
- market
- quantity
- average entry price
- last mark price
- realized pnl

### Market Context

- symbol: `KRW-BTC` or `KRW-ETH`
- current public trade price
- normalized `1h`, `4h`, `1d` candle history

### Active Rule Inputs

The current rule set uses inspectable structure inputs only:

- market regime
- support and resistance context
- invalidation state
- pullback or reclaim availability
- upper-range chase filter
- bearish momentum expansion
- current cash balance
- current paper position quantity

## Decision Output Shape

Required fields:

- `action`
- `summary`
- `reasons`
- `targetCashToUse`
- `targetQuantityFraction`
- `referencePrice`
- `diagnostics`

Allowed action values:

- `HOLD`
- `ENTRY`
- `ADD`
- `REDUCE`
- `EXIT`

## Execution Contract

Execution remains internal only.

- `ENTRY` and `ADD` simulate buy fills
- `REDUCE` and `EXIT` simulate sell fills
- `HOLD` produces no trade row
- fee and slippage assumptions must stay explicit in code constants
- fee, slippage, sizing, and minimum trade assumptions must stay explicit in the paper-trading configuration layer
- cash must never go negative
- quantity must never go negative

## Persistence Expectations

Each hourly paper cycle may persist:

- one `strategy_decisions` row
- zero or one `paper_trades` row
- updated `paper_accounts` state
- updated `paper_positions` state
- one `equity_snapshots` row

## Telegram Contract

User-facing reporting must be explicit that execution is simulated.

- `/status` shows current paper cash, BTC/ETH positions, average entry, and unrealized pnl
- `/pnl` shows realized pnl, current equity, cumulative return, and win rate when available
- `/history` shows recent simulated trades
- `/decision` shows the latest persisted BTC and ETH decision summaries
- `/daily` shows KST-day paper-trading activity
- `/settings` shows active global paper-trading settings
- execution reports must say paper fill or simulated fill and must never imply broker connectivity

## Design Constraints

- keep decision logic inspectable and rule-based
- keep pure logic separate from adapters
- keep additive schema evolution
- keep BTC/ETH-only scope explicit
- keep survival-first and invalidation-first framing visible in naming and reasons
