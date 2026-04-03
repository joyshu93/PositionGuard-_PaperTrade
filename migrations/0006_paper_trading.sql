PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paper_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'KRW',
  initial_cash REAL NOT NULL,
  cash_balance REAL NOT NULL,
  realized_pnl REAL NOT NULL DEFAULT 0,
  total_fees_paid REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (currency = 'KRW'),
  CHECK (initial_cash >= 0),
  CHECK (cash_balance >= 0),
  CHECK (total_fees_paid >= 0)
);

CREATE TABLE IF NOT EXISTS paper_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  asset TEXT NOT NULL,
  market TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  average_entry_price REAL NOT NULL DEFAULT 0,
  last_mark_price REAL,
  realized_pnl REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, asset),
  CHECK (asset IN ('BTC', 'ETH')),
  CHECK (market IN ('KRW-BTC', 'KRW-ETH')),
  CHECK (quantity >= 0),
  CHECK (average_entry_price >= 0),
  CHECK (last_mark_price IS NULL OR last_mark_price >= 0)
);

CREATE TABLE IF NOT EXISTS paper_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  asset TEXT NOT NULL,
  market TEXT NOT NULL,
  side TEXT NOT NULL,
  action TEXT NOT NULL,
  quantity REAL NOT NULL,
  fill_price REAL NOT NULL,
  gross_amount REAL NOT NULL,
  fee_amount REAL NOT NULL,
  realized_pnl REAL NOT NULL DEFAULT 0,
  slippage_rate REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES paper_accounts(id) ON DELETE CASCADE,
  CHECK (asset IN ('BTC', 'ETH')),
  CHECK (market IN ('KRW-BTC', 'KRW-ETH')),
  CHECK (side IN ('BUY', 'SELL')),
  CHECK (action IN ('ENTRY', 'ADD', 'REDUCE', 'EXIT')),
  CHECK (quantity >= 0),
  CHECK (fill_price >= 0),
  CHECK (gross_amount >= 0),
  CHECK (fee_amount >= 0),
  CHECK (slippage_rate >= 0)
);

CREATE TABLE IF NOT EXISTS equity_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  asset TEXT,
  cash_balance REAL NOT NULL,
  position_market_value REAL NOT NULL,
  total_equity REAL NOT NULL,
  realized_pnl REAL NOT NULL,
  unrealized_pnl REAL NOT NULL,
  total_return_pct REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES paper_accounts(id) ON DELETE CASCADE,
  CHECK (asset IS NULL OR asset IN ('BTC', 'ETH')),
  CHECK (cash_balance >= 0),
  CHECK (position_market_value >= 0),
  CHECK (total_equity >= 0)
);

CREATE TABLE IF NOT EXISTS strategy_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  asset TEXT NOT NULL,
  market TEXT NOT NULL,
  action TEXT NOT NULL,
  execution_status TEXT NOT NULL,
  summary TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  rationale_json TEXT,
  reference_price REAL NOT NULL,
  fill_price REAL,
  trade_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trade_id) REFERENCES paper_trades(id) ON DELETE SET NULL,
  CHECK (asset IN ('BTC', 'ETH')),
  CHECK (market IN ('KRW-BTC', 'KRW-ETH')),
  CHECK (action IN ('HOLD', 'ENTRY', 'ADD', 'REDUCE', 'EXIT')),
  CHECK (execution_status IN ('EXECUTED', 'SKIPPED')),
  CHECK (reference_price >= 0),
  CHECK (fill_price IS NULL OR fill_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_paper_accounts_user_id ON paper_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_paper_positions_user_asset ON paper_positions(user_id, asset);
CREATE INDEX IF NOT EXISTS idx_paper_trades_user_created_at ON paper_trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equity_snapshots_user_created_at ON equity_snapshots(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategy_decisions_user_asset_created_at ON strategy_decisions(user_id, asset, created_at DESC);
