# PositionGuard PaperTrade

PositionGuard PaperTrade is a Telegram-based automatic paper-trading bot for `KRW-BTC` and `KRW-ETH` only.

It uses public Upbit quotation and candle data, applies deterministic rule-based logic, simulates fills internally, persists paper account state in D1, and sends Telegram execution reports.

It does not place real orders.

## Product Boundary

This project is:

- a Cloudflare Workers + D1 modular monolith
- a Telegram webhook bot
- a public Upbit market-data consumer
- a rule-based BTC/ETH spot paper-trading engine
- an internal simulated execution and reporting system

This project is not:

- a real trading bot
- an authenticated exchange integration
- a place to store exchange API keys
- a private Upbit account sync
- a live balance mirror
- an LLM-driven trade caller

## Current Vertical Slice

The first paper-trading iteration includes:

- hourly scheduled evaluation for `BTC` and `ETH`
- deterministic actions: `HOLD`, `ENTRY`, `ADD`, `REDUCE`, `EXIT`
- simulated fee and slippage assumptions in code constants
- internal paper fills only
- D1 persistence for accounts, positions, trades, equity snapshots, and strategy decisions
- Telegram read surfaces:
  - `/status`
  - `/positions`
  - `/pnl`
  - `/history`
  - `/decision`
  - `/daily`
  - `/settings`
- Telegram execution summaries for simulated fills
- one concise hourly summary message per user after each hourly cycle

## Architecture

- `src/index.ts`
  - Worker entrypoint, health route, webhook route, dependency wiring
- `src/hourly.ts`
  - hourly automatic paper-trading loop
- `src/upbit.ts`
  - public Upbit quotation and candle normalization
- `src/paper/*`
  - rule-based decision logic, execution math, reporting helpers
- `src/db/*`
  - D1 repositories and typed persistence helpers
- `src/telegram/*`
  - Telegram command routing and client wiring
- `migrations/`
  - additive D1 migrations

## Persistence

Paper-trading state is stored in D1 with these tables:

- `paper_accounts`
- `paper_positions`
- `paper_trades`
- `equity_snapshots`
- `strategy_decisions`

Legacy scaffold tables remain present because this iteration was built additively from the original PositionGuard scaffold.

## Scheduled Flow

On each hourly run:

1. load registered Telegram users
2. ensure a paper account exists
3. fetch Upbit market snapshots for `KRW-BTC` and `KRW-ETH`
4. build deterministic decision context
5. run rule-based paper-trading decision logic
6. simulate fills internally when action is required
7. persist account, position, trade, equity, and strategy decision state
8. persist one aggregate equity snapshot per user after both BTC and ETH finish
9. send Telegram execution summaries for simulated fills
10. send one concise hourly summary per user unless sleep mode is enabled

## Telegram Commands

- `/start`
- `/help`
- `/status`
- `/positions`
- `/pnl`
- `/history`
- `/decision`
- `/daily`
- `/settings`
- `/language <ko|en>`
- `/sleep on`
- `/sleep off`

The previous manual `/setcash` and `/setposition` workflow is intentionally not used in this paper-trading version.

## Settings

Paper-trading settings are resolved through `src/paper/config.ts`.

Current support is global-only:

- default values live in code
- optional environment variables can override them for the whole deployment
- per-user write commands are intentionally not implemented yet

Active settings are visible in `/settings`:

- initial paper cash
- fee rate
- slippage rate
- minimum trade value
- entry allocation
- add allocation
- reduce fraction

Current source precedence:

1. valid environment variable override
2. explicit in-code default

## Reporting Semantics

`/pnl` distinguishes:

- realized PnL
- cumulative realized PnL from closed trades
- unrealized PnL
- current equity
- cumulative return
- cumulative closed-trade win rate
- total closed trades

Cumulative stats are calculated from persisted trade history as follows:

- closed trades = all persisted `paper_trades` rows where `side = 'SELL'`
- in the current implementation, a "closed trade" means a persisted sell-side simulated fill created by `REDUCE` or `EXIT`
- winning closed trades = closed trades where `realized_pnl > 0`
- cumulative closed-trade win rate = `winning closed trades / total closed trades`
- cumulative realized PnL from trades = `SUM(realized_pnl)` across all closed trades
- unrealized PnL = current marked value of open BTC/ETH paper positions minus their average entry basis
- current equity = current cash balance + current marked value of open BTC/ETH paper positions
- cumulative return = `(current equity - initial cash) / initial cash`

`/history` is intentionally recent-only and is labeled that way. It is not the basis for cumulative win rate.

`/decision` shows the latest persisted BTC and ETH decision rows with:

- localized action label
- execution status
- summary
- top reasons
- reference price

If market data was unavailable and the hourly cycle skipped a decision, `/decision` should make that clear from the stored summary and execution status.

`/daily` summarizes the current KST trading day using persisted state:

- number of simulated trades today
- realized PnL today
- current total equity
- BTC action counts today
- ETH action counts today

Hourly reporting behavior:

- execution alerts are sent only when a simulated fill is executed
- one hourly summary is sent after BTC and ETH are both processed
- hourly summary and execution alerts respect sleep mode
- action labels are localized for both English and Korean output

## Local Setup

1. Install dependencies with `npm install`.
2. Create a D1 database and update `wrangler.toml`.
3. Apply migrations.
4. Set Telegram secrets.
5. Run typecheck, build, and tests.

Useful commands:

- `npm run typecheck`
- `npm run build`
- `npm run test`
- `npm run check`
- `npm run dev`

## Intentional Non-Goals In This Iteration

- no real exchange order placement
- no authenticated private API access
- no live balance sync
- no leverage
- no assets beyond BTC and ETH
- no opaque scoring model
- no discretionary AI judgment
