import { deal, samePlace, shuffle, type DealtSlot } from "./deal";
import {
  COUNTDOWN_FROM,
  COUNTDOWN_MS,
  type AnswerRecord,
  type Half,
  type Phase,
  type PlayPackage,
  type RoomConfig,
  type RoomSnapshot,
  type SlotView,
} from "./types";

export type HostOverlay = {
  playPackage: PlayPackage | null;
  phase: Phase;
  slots: SlotView[];
  prompt: number | null;
  asked: number;
  questionTotal: number;
  correct: number;
  flashStartedAt: number | null;
  flashEndsAt: number | null;
  finishedAt: number | null;
  reviewIndex: number | null;
  answers: AnswerRecord[];
  hostNow: number;
  running: boolean;
};

export type LocalGame = {
  slots: DealtSlot[];
  order: number[];
  promptIndex: number;
  answers: AnswerRecord[];
  asked: number;
  correct: number;
};

export function idsFromSnapshot(snapshot: RoomSnapshot): string[] {
  return [...snapshot.displays]
    .filter((d) => d.connected)
    .sort((a, b) => a.place - b.place)
    .map((d) => d.id);
}

export function createLocalGame(ids: string[], config: RoomConfig): LocalGame {
  const slots = deal(ids, config.centerNumber, config.split, config.level, Math.random);
  const order = shuffle(
    slots.map((_, index) => index),
    Math.random
  );
  return {
    slots,
    order,
    promptIndex: 0,
    answers: [],
    asked: 0,
    correct: 0,
  };
}

export function buildFlashPackage(
  config: RoomConfig,
  now = Date.now()
): PlayPackage {
  const flashStartedAt = now + COUNTDOWN_FROM * COUNTDOWN_MS;
  const flashEndsAt = flashStartedAt + Math.round(config.flashSeconds * 1000);
  return {
    countdownStartedAt: now,
    countdownFrom: COUNTDOWN_FROM,
    countdownMs: COUNTDOWN_MS,
    flashStartedAt,
    flashEndsAt,
  };
}

function publicSlots(
  slots: DealtSlot[],
  phase: Phase,
  answers: AnswerRecord[],
  reviewIndex: number | null
): SlotView[] {
  // countdown/flash は端末時計で出すので値を載せる。ready/answer は隠す。
  const hideValues = phase === "answer" || phase === "ready";
  const revealMarks = phase === "review";
  const review = reviewIndex != null ? answers[reviewIndex] : null;

  return slots.map((slot) => {
    let correct: boolean | null = null;
    let picked: boolean | null = null;
    if (revealMarks && review) {
      const isCorrectPlace = samePlace(slot, review.correctId, review.correctHalf);
      const isPicked = samePlace(slot, review.userId, review.userHalf);
      picked = isPicked;
      if (isCorrectPlace) correct = true;
      else if (isPicked) correct = false;
      else correct = null;
    } else if (phase === "result") {
      // 結果画面では数字だけ（○×は答え合わせへ）
      correct = null;
      picked = null;
    }
    return {
      id: slot.id,
      half: slot.half,
      value: hideValues ? null : slot.value,
      correct,
      picked,
    };
  });
}

export function overlayForPhase(
  game: LocalGame,
  phase: Phase,
  pkg: PlayPackage | null,
  opts?: { reviewIndex?: number | null; hostNow?: number; finishedAt?: number | null }
): HostOverlay {
  const reviewIndex = opts?.reviewIndex ?? null;
  const hostNow = opts?.hostNow ?? Date.now();
  return {
    playPackage: phase === "countdown" || phase === "flash" ? pkg : null,
    phase,
    slots: publicSlots(game.slots, phase, game.answers, reviewIndex),
    prompt:
      phase === "answer"
        ? (game.slots[game.order[game.promptIndex]]?.value ?? null)
        : phase === "review" && reviewIndex != null
          ? (game.answers[reviewIndex]?.prompt ?? null)
          : null,
    asked: game.asked,
    questionTotal: game.slots.length,
    correct: game.correct,
    flashStartedAt: pkg?.flashStartedAt ?? null,
    flashEndsAt: pkg?.flashEndsAt ?? null,
    finishedAt: opts?.finishedAt ?? null,
    reviewIndex: phase === "review" ? reviewIndex : null,
    answers: phase === "result" || phase === "review" ? [...game.answers] : [],
    hostNow,
    running: phase !== "idle" && phase !== "result" && phase !== "review",
  };
}

export function applyTap(
  game: LocalGame,
  deviceId: string,
  half: Half | null
): LocalGame | null {
  if (game.promptIndex >= game.order.length) return null;
  const slot = game.slots[game.order[game.promptIndex]];
  if (!slot) return null;
  const hit = samePlace(slot, deviceId, half);
  const answers = [
    ...game.answers,
    {
      prompt: slot.value,
      correctId: slot.id,
      correctHalf: slot.half,
      userId: deviceId,
      userHalf: half,
      hit,
    },
  ];
  return {
    ...game,
    answers,
    asked: game.asked + 1,
    correct: game.correct + (hit ? 1 : 0),
    promptIndex: game.promptIndex + 1,
  };
}

export function countdownDigit(pkg: PlayPackage, now: number): number | null {
  if (now >= pkg.flashStartedAt) return null;
  const elapsed = now - pkg.countdownStartedAt;
  const step = Math.floor(elapsed / pkg.countdownMs);
  const digit = pkg.countdownFrom - step;
  if (digit < 1) return null;
  return digit;
}
