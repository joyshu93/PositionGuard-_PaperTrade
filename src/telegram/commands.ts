import type { SupportedLocale } from "../domain/types.js";
import { resolveUserLocale } from "../i18n/index.js";
import { parseCashAmount, parseSleepModeArg } from "./parser.js";
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
    return [
      send(
        context.chatId,
        await deps.paperTradingProvider?.getStatus(context.userId, locale) ?? unavailable(locale),
      ),
    ];
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
    case "settings":
      return [send(context.chatId, await deps.paperTradingProvider?.getSettings(context.userId, locale) ?? unavailable(locale))];
    case "decision":
      return [send(context.chatId, await deps.paperTradingProvider?.getDecision(context.userId, locale) ?? unavailable(locale))];
    case "daily":
      return [send(context.chatId, await deps.paperTradingProvider?.getDaily(context.userId, locale) ?? unavailable(locale))];
    case "setstartcash":
      return handleSetStartCash(context, deps, locale);
    case "resetpaper":
      return handleResetPaper(context, deps, locale);
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
      return [
        send(
          context.chatId,
          locale === "ko"
            ? "알 수 없는 명령입니다. /help를 확인해 주세요."
            : "Unknown command. Use /help to see supported commands.",
        ),
      ];
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
  return [send(context.chatId, locale === "ko" ? `수면 모드가 ${enabled ? "켜졌습니다" : "꺼졌습니다"}.` : `Sleep mode is now ${enabled ? "on" : "off"}.`)];
}

async function handleSetStartCash(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const amount = parseCashAmount(context.args.join(" "));
  if (amount === null || amount <= 0) {
    return [
      send(
        context.chatId,
        locale === "ko"
          ? "사용법: /setstartcash <양수 KRW 금액>"
          : "Usage: /setstartcash <positive KRW amount>",
      ),
    ];
  }

  const saved = await deps.stateStore?.setNextPaperStartCash?.(context.userId, amount);
  const nextCash = saved ?? amount;
  return [
    send(
      context.chatId,
      locale === "ko"
        ? `다음 /resetpaper confirm부터 시작금액 ${formatKrw(nextCash)} 이 적용됩니다. 현재 계좌는 즉시 바뀌지 않습니다.`
        : `Starting cash ${formatKrw(nextCash)} will be applied on the next /resetpaper confirm. The current account is not changed immediately.`,
    ),
  ];
}

async function handleResetPaper(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  if (context.args[0]?.toLowerCase() !== "confirm") {
    return [
      send(
        context.chatId,
        locale === "ko"
          ? [
              "페이퍼 계좌 초기화는 확인이 필요합니다.",
              "실행하려면: /resetpaper confirm",
              "다른 시작금액을 쓰려면 먼저 /setstartcash <금액> 을 입력하세요.",
              "초기화 시 거래내역, 포지션, 손익, equity snapshot, decision 기록이 새 출발 상태로 리셋됩니다.",
            ].join("\n")
          : [
              "Paper account reset requires confirmation.",
              "To run it: /resetpaper confirm",
              "If you want a different starting cash, use /setstartcash <amount> first.",
              "Reset clears trades, positions, PnL state, equity snapshots, and strategy decisions for a fresh start.",
            ].join("\n"),
      ),
    ];
  }

  const result = await deps.stateStore?.resetPaperTrading?.(context.userId);
  if (!result) {
    return [send(context.chatId, unavailable(locale))];
  }

  return [
    send(
      context.chatId,
      locale === "ko"
        ? [
            "페이퍼 계좌가 초기화되었습니다.",
            `새 시작금액: ${formatKrw(result.startingCash)}`,
            "포지션, 거래이력, 손익, equity snapshot, decision 기록이 새 출발 상태로 리셋되었습니다.",
          ].join("\n")
        : [
            "Paper account reset completed.",
            `New starting cash: ${formatKrw(result.startingCash)}`,
            "Positions, trade history, PnL state, equity snapshots, and decision records were reset for a fresh start.",
          ].join("\n"),
    ),
  ];
}

function buildStartText(locale: SupportedLocale): string {
  if (locale === "ko") {
    return [
      "PositionGuard PaperTrade는 BTC/ETH 전용 자동 페이퍼트레이딩 Telegram 봇입니다.",
      "실거래 주문은 전송하지 않으며 Upbit 공개 시세만 사용해 내부적으로 모의 체결합니다.",
      "주요 명령: /status /positions /pnl /history /decision /daily /settings /setstartcash /resetpaper",
    ].join("\n");
  }

  return [
    "PositionGuard PaperTrade is an automatic BTC/ETH-only paper-trading Telegram bot.",
    "It never sends real orders and uses public Upbit market data only for internal simulated fills.",
    "Core commands: /status /positions /pnl /history /decision /daily /settings /setstartcash /resetpaper",
  ].join("\n");
}

function buildHelpText(locale: SupportedLocale): string {
  if (locale === "ko") {
    return [
      "명령어",
      "/start - 제품 소개",
      "/help - 명령어 목록",
      "/status - 현금, 총자산, 손익 요약",
      "/positions - BTC/ETH 포지션 상세",
      "/pnl - 누적 손익과 종료 거래 승률",
      "/history - 최근 모의 체결 이력",
      "/decision - 최신 BTC/ETH 결정 요약",
      "/daily - 오늘의 거래/액션 요약 (KST 기준)",
      "/settings - 현재 적용 중인 전역 설정",
      "/setstartcash <금액> - 다음 초기화 때 쓸 시작금액 저장",
      "/resetpaper - 초기화 안내",
      "/resetpaper confirm - 페이퍼 계좌 새로 시작",
      "/language <ko|en> - 언어 선택",
      "/sleep on|off - 실행 알림과 시간별 요약 끄기/켜기",
    ].join("\n");
  }

  return [
    "Commands:",
    "/start - product intro",
    "/help - command list",
    "/status - cash, equity, and compact PnL summary",
    "/positions - focused BTC/ETH position view",
    "/pnl - cumulative performance and closed-trade win rate",
    "/history - recent simulated trades",
    "/decision - latest BTC/ETH decision summaries",
    "/daily - today's paper-trading activity summary (KST)",
    "/settings - active global paper-trading settings",
    "/setstartcash <amount> - save starting cash for the next reset",
    "/resetpaper - reset instructions",
    "/resetpaper confirm - start a fresh paper account",
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
    ? "이 버전은 더 이상 수동 기록용 상태 명령을 쓰지 않습니다. /status, /positions, /pnl, /history, /decision, /daily, /settings를 사용해 주세요."
    : "This version no longer uses manual record-only state commands. Use /status, /positions, /pnl, /history, /decision, /daily, and /settings instead.";
}

function unavailable(locale: SupportedLocale): string {
  return locale === "ko"
    ? "아직 페이퍼트레이딩 상태를 불러올 수 없습니다."
    : "Paper-trading status is not available yet.";
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} KRW`;
}

function send(chatId: number, text: string, replyMarkup?: TelegramReplyMarkup): TelegramOutgoingAction {
  return replyMarkup ? { kind: "sendMessage", chatId, text, replyMarkup } : { kind: "sendMessage", chatId, text };
}
