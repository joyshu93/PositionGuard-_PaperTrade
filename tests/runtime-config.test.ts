import {
  assertRuntimeConfig,
  createRuntimeConfig,
  getRuntimeConfigReport,
} from "../src/env.js";
import { DEFAULT_PAPER_TRADING_SETTINGS } from "../src/paper/config.js";
import { assert, assertEqual } from "./test-helpers.js";

const validReport = getRuntimeConfigReport(
  {
    DB: {
      prepare() {
        throw new Error("not used");
      },
    } as unknown as D1Database,
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "secret-token",
    HEALTH_PATH: "/healthz",
    TELEGRAM_WEBHOOK_PATH: "/telegram/webhook",
    UPBIT_BASE_URL: "https://api.upbit.com",
  },
  "webhook",
);

assertEqual(validReport.ok, true, "A complete deployment config should validate.");
assertEqual(validReport.healthPath, "/healthz", "Configured health path should be preserved.");

const runtimeConfig = createRuntimeConfig({
  DB: {
    prepare() {
      throw new Error("not used");
    },
  } as unknown as D1Database,
  TELEGRAM_BOT_TOKEN: "bot-token",
  TELEGRAM_WEBHOOK_SECRET: "secret-token",
  PAPER_INITIAL_CASH_KRW: "2500000",
  PAPER_FEE_RATE: "0.0008",
  PAPER_ENTRY_ALLOCATION: "0.35",
  PAPER_TOTAL_PORTFOLIO_MAX_EXPOSURE: "0.7",
});

assertEqual(
  runtimeConfig.paperTradingSettings.values.initialPaperCashKrw,
  2_500_000,
  "Runtime config should resolve explicit paper-cash overrides.",
);
assertEqual(
  runtimeConfig.paperTradingSettings.values.feeRate,
  0.0008,
  "Runtime config should resolve explicit fee overrides.",
);
assertEqual(
  runtimeConfig.paperTradingSettings.values.slippageRate,
  0.0003,
  "Missing paper settings should fall back to explicit defaults.",
);
assertEqual(
  runtimeConfig.paperTradingSettings.values.minimumTradeValueKrw,
  5_000,
  "Minimum trade value should fall back to the explicit Upbit KRW reference default.",
);
assertEqual(
  runtimeConfig.paperTradingSettings.values.addAllocation,
  DEFAULT_PAPER_TRADING_SETTINGS.addAllocation,
  "Missing add-allocation overrides should fall back to the updated conservative default.",
);
assertEqual(
  runtimeConfig.paperTradingSettings.sourceByField.entryAllocation,
  "env",
  "Settings metadata should indicate when a field comes from an env override.",
);
assertEqual(
  runtimeConfig.paperTradingSettings.sourceByField.reduceFraction,
  "default",
  "Settings metadata should indicate when a field remains on the default fallback.",
);
assertEqual(
  runtimeConfig.paperTradingSettings.values.strongTrendPerAssetMaxAllocation,
  DEFAULT_PAPER_TRADING_SETTINGS.strongTrendPerAssetMaxAllocation,
  "Strong-trend per-asset allocation should fall back to the explicit default when not overridden.",
);
assertEqual(
  runtimeConfig.paperTradingSettings.values.totalPortfolioMaxExposure,
  0.7,
  "Runtime config should resolve exposure-based guardrail overrides.",
);

const defaultSizingRuntimeConfig = createRuntimeConfig({
  DB: {
    prepare() {
      throw new Error("not used");
    },
  } as unknown as D1Database,
  TELEGRAM_BOT_TOKEN: "bot-token",
  TELEGRAM_WEBHOOK_SECRET: "secret-token",
});

assertEqual(
  defaultSizingRuntimeConfig.paperTradingSettings.values.entryAllocation,
  DEFAULT_PAPER_TRADING_SETTINGS.entryAllocation,
  "Missing entry-allocation overrides should fall back to the updated staged-entry default.",
);
assertEqual(
  defaultSizingRuntimeConfig.paperTradingSettings.values.addAllocation,
  DEFAULT_PAPER_TRADING_SETTINGS.addAllocation,
  "Missing add-allocation overrides should fall back to the updated staged-add default.",
);
assertEqual(
  defaultSizingRuntimeConfig.paperTradingSettings.values.strongTrendPerAssetMaxAllocation,
  DEFAULT_PAPER_TRADING_SETTINGS.strongTrendPerAssetMaxAllocation,
  "Missing strong-trend cap overrides should fall back to the documented concentration backstop default.",
);

const invalidReport = getRuntimeConfigReport(
  {
    DB: null as unknown as D1Database,
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_WEBHOOK_SECRET: "",
    HEALTH_PATH: "health",
    TELEGRAM_WEBHOOK_PATH: "telegram/webhook",
    UPBIT_BASE_URL: "notaurl",
  },
  "webhook",
);

assertEqual(invalidReport.ok, false, "An incomplete deployment config should fail validation.");
assert(
  invalidReport.errors.some((error) => error.includes("D1 binding")),
  "Validation should report a missing D1 binding.",
);
assert(
  invalidReport.errors.some((error) => error.includes("TELEGRAM_BOT_TOKEN")),
  "Validation should report a missing bot token.",
);
assert(
  invalidReport.errors.some((error) => error.includes("TELEGRAM_WEBHOOK_SECRET")),
  "Validation should report a missing webhook secret.",
);
assert(
  invalidReport.healthPath === "/health",
  "Validation should normalize health paths into a safe route shape.",
);
assert(
  invalidReport.errors.some((error) => error.includes("UPBIT_BASE_URL")),
  "Validation should report invalid Upbit override URLs.",
);

let threw = false;
try {
  assertRuntimeConfig(
    {
      DB: null as unknown as D1Database,
      TELEGRAM_BOT_TOKEN: "",
    },
    "scheduled",
  );
} catch (error) {
  threw = true;
  assert(
    error instanceof Error && error.message.includes("scheduled"),
    "assertRuntimeConfig should include the failing scope.",
  );
}

assertEqual(threw, true, "assertRuntimeConfig should throw when scheduled config is invalid.");
