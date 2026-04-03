# WONYOTTI_PRINCIPLES.md

## Purpose

This document defines the philosophy of the BTC/ETH paper-trading bot.

The system now performs automatic simulated spot trades, but the philosophical frame remains conservative:

- trend first
- survival first
- invalidation first
- no chase buying
- spot-first thinking

## Core Principles

### 1. Trend First

The system should respect higher-timeframe structure before acting.

### 2. Survival First

The engine should prefer capital preservation over activity. When structure is unclear, `HOLD` is acceptable.

### 3. Price / Levels / Structure Over Narrative

Public price structure is primary. News and discretionary opinion are outside scope.

### 4. Invalidation First

Every non-hold action should have an understandable invalidation context. If invalidation is unclear, reduce aggression or do nothing.

### 5. No Chase Buying

Late upper-range entries should be filtered aggressively. Reclaim participation is allowed only when the rule path is explicit and inspectable.

### 6. No Revenge Logic

Losses must not trigger oversized or emotional responses. The bot should never average down blindly into breakdown.

### 7. Rotational Spot Management

The system may stage entry, add, reduce, and exit decisions, but always in spot-only paper-trading terms.

### 8. Spot-First Thinking

No leverage concepts, no liquidation framing, no derivatives language.

### 9. Simulated Execution Honesty

All user-facing output must clearly state that fills are simulated paper fills. The bot must never imply real broker connectivity.

## Product Consequences

- support only BTC and ETH
- support only `KRW-BTC` and `KRW-ETH`
- use public Upbit quotation/candle data only
- execute only internal simulated paper fills
- persist paper account, positions, trades, and equity
- keep Telegram output concise and operational

## Naming Guidance

Prefer names that imply:

- structure
- invalidation
- rotation
- paper execution
- state
- equity

Avoid names that imply:

- certainty
- hidden scoring
- real broker authority
- leverage trading
- guaranteed profits
