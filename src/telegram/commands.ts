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
    return [send(context.chatId, await deps.paperTradingProvider?.getStatus(context.userId, locale) ?? unavailable(locale))];
  }

  switch (command) {
    case "start":
      return [send(context.chatId, buildStartText(locale))];
    case "help":
      return [send(context.chatId, buildHelpText(locale))];
    case "status":
      return [send(context.chatId, await deps.paperTradingProvider?.getStatus(context.userId, locale) ?? unavailable(locale))];
    case "positions":
      return [send(context.chatId, await deps.paperTradingProvider?.getPositions(context.userId, locale) ?? unavailable(locale))];
    case "pnl":
      return [send(context.chatId, await deps.paperTradingProvider?.getPnl(context.userId, locale) ?? unavailable(locale))];
    case "history":
      return [send(context.chatId, await deps.paperTradingProvider?.getHistory(context.userId, locale) ?? unavailable(locale))];
    case "language":
      return handleLanguage(context, deps, locale);
    case "sleep":
      return handleSleep(context, deps, locale);
    case "track":
    case "setcash":
    case "setposition":
    case "lastdecision":
    case "hourlyhealth":
    case "lastalert":
      return [send(context.chatId, legacyNotice(locale))];
    default:
      return [send(context.chatId, locale === "ko" ? "알 수 없는 명령입니다. /help 를 확인해 주세요." : "Unknown command. Use /help to see supported commands.")];
  }
}

async function handleLanguage(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const requested = context.args[0]?.trim().toLowerCase();
  if (requested !== "ko" && requested !== "en") {
    return [send(context.chatId, locale === "ko" ? "사용법: /language <ko|en>" : "Usage: /language <ko|en>")];
  }

  await deps.stateStore?.setLocale?.(context.userId, requested);
  return [send(context.chatId, requested === "ko" ? "언어가 한국어로 저장되었습니다." : "Language saved: English.")];
}

async function handleSleep(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const enabled = parseSleepModeArg(context.args);
  if (enabled === null) {
    return [send(context.chatId, locale === "ko" ? "사용법: /sleep on 또는 /sleep off" : "Usage: /sleep on or /sleep off")];
  }

  await deps.stateStore?.setSleepMode(context.userId, enabled);
  return [send(context.chatId, locale === "ko" ? `수면 모드는 이제 ${enabled ? "켜짐" : "꺼짐"} 상태입니다.` : `Sleep mode is now ${enabled ? "on" : "off"}.`)];
}

function buildStartText(locale: SupportedLocale): string {
  if (locale === "ko") {
    return [
      "PositionGuard PaperTrade는 BTC/ETH 전용 자동 페이퍼트레이딩 Telegram 봇입니다.",
      "실제 주문은 전송하지 않으며 Upbit 공개 시세만 사용해 내부적으로 모의 체결합니다.",
      "주요 명령: /status /positions /pnl /history",
    ].join("\n");
  }

  return [
    "PositionGuard PaperTrade is an automatic BTC/ETH-only paper-trading Telegram bot.",
    "It never sends real orders and uses public Upbit market data only for internal simulated fills.",
    "Core commands: /status /positions /pnl /history",
  ].join("\n");
}

function buildHelpText(locale: SupportedLocale): string {
  if (locale === "ko") {
    return [
      "명령어:",
      "/start - 제품 소개",
      "/help - 명령어 목록",
      "/status - 현금, 자산, 요약 손익",
      "/positions - BTC/ETH 포지션 상세",
      "/pnl - 누적 손익과 승률",
      "/history - 최근 모의 체결 내역",
      "/language <ko|en> - 언어 선택",
      "/sleep on|off - 시간별 요약과 체결 알림 끄기/켜기",
    ].join("\n");
  }

  return [
    "Commands:",
    "/start - product intro",
    "/help - command list",
    "/status - cash, equity, and compact PnL summary",
    "/positions - focused BTC/ETH position view",
    "/pnl - cumulative performance and win rate",
    "/history - recent simulated trades",
    "/language <ko|en> - choose bot language",
    "/sleep on|off - mute or resume hourly and execution reports",
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

function legacyNotice(locale: SupportedLocale): string {
  return locale === "ko"
    ? "이 페이퍼트레이딩 버전은 더 이상 수동 기록 명령을 사용하지 않습니다. /status, /positions, /pnl, /history 를 사용해 주세요."
    : "This paper-trading version no longer uses manual record-only state commands. Use /status, /positions, /pnl, and /history instead.";
}

function unavailable(locale: SupportedLocale): string {
  return locale === "ko" ? "아직 페이퍼트레이딩 상태를 불러올 수 없습니다." : "Paper-trading status is not available yet.";
}

function send(chatId: number, text: string, replyMarkup?: TelegramReplyMarkup): TelegramOutgoingAction {
  return replyMarkup ? { kind: "sendMessage", chatId, text, replyMarkup } : { kind: "sendMessage", chatId, text };
}
