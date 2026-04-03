# AGENTS.md

## Mandatory Reading Order

Before writing or modifying code in this repository, read:

1. `WONYOTTI_PRINCIPLES.md`
2. `DECISION_SCHEMA.md`
3. `README.md`

Treat those files as authoritative for naming, product boundary, and architectural intent.

## Product Boundary

This repository is an automatic Telegram paper-trading bot for BTC and ETH only.

It is not real trading.

Agents must not implement:

- real order placement
- exchange API key storage
- authenticated or private exchange APIs
- live balance sync
- discretionary LLM-based trade judgment
- leverage features

## Architecture Expectations

- keep the modular monolith style
- keep domain logic pure where possible
- keep Telegram, Upbit, persistence, and strategy modules separate
- preserve strong TypeScript typing
- keep rule logic inspectable

## Coding Rules

- use explicit money and quantity assumptions
- do not hide fee or slippage defaults
- stay limited to `KRW-BTC` and `KRW-ETH`
- prefer additive schema changes
- prefer pure helpers for pnl, sizing, equity, and simulated execution math

## Documentation Rules

When behavior changes:

- update `README.md`
- update `DECISION_SCHEMA.md`
- update `WONYOTTI_PRINCIPLES.md`

## Validation Rules

Do not claim completion unless code changes are actually present and validation was run where feasible.
