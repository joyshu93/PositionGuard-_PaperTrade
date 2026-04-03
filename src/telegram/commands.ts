import type { SupportedLocale } from "../domain/types.js";
import { resolveUserLocale } from "../i18n/index.js";
import { parseSleepModeArg } from "./parser.js";
import type {
  TelegramCommandContext,
  TelegramOutgoingAction,
  TelegramReplyMarkup,
  TelegramRouterDependencies,
} from "./types.js";

export async function routeCommand(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
): Promise<TelegramOutgoingAction[]> {
  const bootstrappedLocale = await deps.stateStore?.upsertUserState(context.profile);
  const locale = resolveUserLocale(
    (bootstrappedLocale as SupportedLocale | null | undefined) ??
      context.profile.preferredLocale ??
      null,
    context.profile.languageCode ?? null,
  );
  const command = context.command.toLowerCase();

  if (command === "callback") {
    return [send(context.chatId, await deps.paperTradingProvider?.getStatus(context.userId, locale) ?? "Paper status is not available yet.")];
  }

  switch (command) {
    case "start":
      return [send(context.chatId, buildStartText())];
    case "help":
      return [send(context.chatId, buildHelpText())];
    case "status":
      return [send(context.chatId, await deps.paperTradingProvider?.getStatus(context.userId, locale) ?? "Paper status is not available yet.")];
    case "pnl":
      return [send(context.chatId, await deps.paperTradingProvider?.getPnl(context.userId, locale) ?? "Paper PnL is not available yet.")];
    case "history":
      return [send(context.chatId, await deps.paperTradingProvider?.getHistory(context.userId, locale) ?? "Paper history is not available yet.")];
    case "language":
      return handleLanguage(context, deps);
    case "sleep":
      return handleSleep(context, deps);
    case "track":
    case "setcash":
    case "setposition":
    case "lastdecision":
    case "hourlyhealth":
    case "lastalert":
      return [
        send(
          context.chatId,
          "This paper-trading version no longer uses manual record-only state commands. Use /status, /pnl, and /history instead.",
        ),
      ];
    default:
      return [send(context.chatId, "Unknown command. Use /help to see supported commands.")];
  }
}

async function handleLanguage(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
): Promise<TelegramOutgoingAction[]> {
  const requested = context.args[0]?.trim().toLowerCase();
  if (requested !== "ko" && requested !== "en") {
    return [send(context.chatId, "Usage: /language <ko|en>")];
  }

  await deps.stateStore?.setLocale?.(context.userId, requested);
  return [send(context.chatId, `Language saved: ${requested}.`)];
}

async function handleSleep(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
): Promise<TelegramOutgoingAction[]> {
  const enabled = parseSleepModeArg(context.args);
  if (enabled === null) {
    return [send(context.chatId, "Usage: /sleep on or /sleep off")];
  }

  await deps.stateStore?.setSleepMode(context.userId, enabled);
  return [send(context.chatId, `Sleep mode is now ${enabled ? "on" : "off"}.`)];
}

function buildStartText(): string {
  return [
    "PositionGuard PaperTrade is an automatic BTC/ETH-only paper-trading Telegram bot.",
    "It never sends real orders and uses public Upbit market data only for internal simulated fills.",
    "Core commands: /status /pnl /history",
  ].join("\n");
}

function buildHelpText(): string {
  return [
    "Commands:",
    "/start - product intro",
    "/help - command list",
    "/status - current cash and BTC/ETH paper positions",
    "/pnl - realized PnL, equity, cumulative return, and win rate",
    "/history - recent simulated trades",
    "/language <ko|en> - choose bot language",
    "/sleep on|off - mute or resume execution reports",
  ].join("\n");
}

export function buildOnboardingKeyboard(): TelegramReplyMarkup {
  return { inline_keyboard: [] };
}

export function buildActionNeededAlertText(input: {
  reason: string;
  asset: "BTC" | "ETH" | null;
  summary: string;
  nextStep: string;
}): string {
  const asset = input.asset ?? "portfolio";
  return [
    `Paper alert: ${asset} ${input.reason}`,
    input.summary,
    input.nextStep,
    "This is a simulated paper-trading alert. No real order was sent.",
  ].join("\n");
}

export function buildActionNeededAlertActions(input: {
  chatId: number;
  reason: string;
  asset: "BTC" | "ETH" | null;
  summary: string;
  nextStep: string;
}): TelegramOutgoingAction[] {
  return [send(input.chatId, buildActionNeededAlertText(input))];
}

function send(chatId: number, text: string, replyMarkup?: TelegramReplyMarkup): TelegramOutgoingAction {
  return replyMarkup ? { kind: "sendMessage", chatId, text, replyMarkup } : { kind: "sendMessage", chatId, text };
}
