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
  - `/setstartcash`
  - `/resetpaper`
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
3. fetch fresh Upbit market snapshots for `KRW-BTC` and `KRW-ETH` once for that hourly run
4. build deterministic decision context
5. run rule-based paper-trading decision logic
6. simulate fills internally when action is required
7. persist account, position, trade, equity, and strategy decision state
8. persist one aggregate equity snapshot per user after both BTC and ETH finish
9. send Telegram execution summaries for simulated fills
10. send one concise hourly summary per user unless sleep mode is enabled

Market-data freshness semantics:

- each hourly run fetches fresh public Upbit data for BTC and ETH at run time
- the hourly run fetches BTC and ETH as one batch before per-asset decision processing
- each fetched snapshot now pulls `200` candles for `1h`, `4h`, and `1d` so the EMA/MACD-based structure logic is operating on enough history to be meaningful
- structure analysis now uses the latest completed candle for timeframe logic while still using the current ticker price for hourly execution and reporting
- ticker and candle data are not intentionally reused from a previous hourly run
- ticker metadata now preserves exchange trade time plus fetch time
- candle metadata now preserves both candle open time and derived candle close time
- portfolio exposure checks now use the same fresh BTC/ETH batch prices when that hourly batch is available, instead of mixing one fresh mark with one stale persisted mark

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
- `/setstartcash <amount>`
- `/resetpaper`
- `/resetpaper confirm`
- `/language <ko|en>`
- `/sleep on`
- `/sleep off`

The previous manual `/setcash` and `/setposition` workflow is intentionally not used in this paper-trading version.

`/start` is intentionally button-first:

- it introduces the paper-trading boundary briefly
- it opens a compact inline menu for `/status`, `/positions`, `/pnl`, `/history`, `/decision`, `/daily`, `/settings`, and `/help`
- it avoids dumping the main command list as one long text line

`/status` and `/positions` now use query-time public Upbit ticker prices when available:

- they still load persisted account and position state from D1
- they then overlay fresh BTC/ETH public ticker prices for the current query
- if a live ticker request fails, they fall back to the latest persisted mark price for that asset
- this live-price overlay is for read visibility only and does not mutate persisted state by itself

## Settings

Paper-trading settings are resolved through `src/paper/config.ts`.

Current support is global-only:

- default values live in code
- optional environment variables can override them for the whole deployment
- per-user write commands are intentionally not implemented yet

Active settings are visible in `/settings`.

`/settings` now separates:

- exchange-referenced assumptions
  - fee rate
  - minimum trade value
- internal simulation and strategy settings
  - initial paper cash
  - slippage rate
  - entry allocation
  - add allocation
  - reduce fraction
  - per-asset max allocation
  - total portfolio max exposure

Current source precedence:

1. valid environment variable override
2. explicit in-code default

Important notes about settings semantics:

- the bot does not live-sync exchange policy values from Upbit during runtime
- fee rate and minimum trade value are explicit reference assumptions configured in code or env
- minimum trade value default is currently aligned to the Upbit KRW minimum-order reference of `5,000 KRW`
- slippage, staged sizing, and exposure limits are internal paper-trading assumptions, not exchange policy values
- source labels in `/settings` indicate whether the active value comes from a deployment env override or from the code default

Paper reset behavior:

- `/setstartcash <amount>` stores a one-time starting cash value for the next reset only
- `/resetpaper` shows the safety prompt
- `/resetpaper confirm` clears persisted paper account state and starts fresh
- after reset, the saved one-time starting cash is consumed and cleared
- if no one-time starting cash is saved, reset falls back to the global default starting cash

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

`/pnl`, `/daily`, and hourly persisted performance snapshots still reflect persisted paper-trading state. The live query-time price overlay is currently limited to `/status` and `/positions`.

`/decision` shows the latest persisted BTC and ETH decision rows with:

- localized action label
- whether the action was immediate, deferred for confirmation, or executed after confirmation
- entry path: `PULLBACK`, `RECLAIM`, or `BREAKOUT_HOLD`
- trend alignment score
- recovery quality score
- breakdown pressure summary
- summary
- top reasons
- signal quality bucket
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
- Telegram delivery now uses a small bounded retry before finally logging and giving up, so transient send failures are less likely to drop an alert
- action labels are localized for both English and Korean output

## Decision Quality Refinements

This version improves decision quality without adding artificial trade bans such as max-trades-per-day locks or forced cooldown timers.

The main refinements are:

- hysteresis: it is intentionally harder to switch from flat/HOLD into `ENTRY` or `ADD` than it is to remain on `HOLD`
- confirmation for borderline bullish setups: weaker but still valid `ENTRY` and `ADD` setups are deferred until the immediately previous hourly cycle showed the same deferred setup signature again (`action + entryPath + signal-quality bucket`)
- immediate invalidation exits: invalidation-based `EXIT` remains immediate and is never delayed by confirmation logic
- graduated sizing: stronger constructive structure uses more of the staged allocation, while borderline confirmed structure uses less
- soft re-entry caution: a recent exit slightly raises the threshold for a fresh `ENTRY`, but strong reclaim/recovery structure can still override it
- exposure-based guardrails: additional bullish sizing is capped by per-asset and total-portfolio exposure limits
- mid-range pullbacks now need better recovery quality before they count as constructive bullish candidates
- recovery volume is now interpreted more conservatively so muted or still-forming spikes are less likely to lift a setup into action
- entry paths are now explicit so a bullish setup is inspectable as a pullback, reclaim, or breakout-hold path
- add logic is stricter than entry logic: an existing position must still be healthy and aligned before staged adds are allowed
- decision diagnostics now expose trend alignment, recovery quality, and breakdown pressure so operator review is less guessy
- reclaim paths can clear slightly faster bullish thresholds when recovery quality and trend alignment are already strong
- breakout-hold paths use stricter thresholds so continuation setups need more confirmation and are less likely to become chase buys
- pullback adds are stricter than pullback entries, especially when the pullback is not clearly lower in the range
- soft weakening can trigger only a modest protective `REDUCE`, while clear weakening can justify a larger staged reduction

These are decision-quality refinements, not mechanical trade-frequency bans.

## Fresh Start Workflow

If an operator wants a clean paper-trading restart:

1. run `/setstartcash <amount>` if a non-default starting cash is desired
2. run `/resetpaper`
3. run `/resetpaper confirm`

Reset clears:

- paper account state
- paper positions
- paper trades
- equity snapshots
- strategy decisions

This is intentionally safer than mutating the active account baseline in place, because it keeps cumulative return semantics and historical accounting from becoming ambiguous.

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
