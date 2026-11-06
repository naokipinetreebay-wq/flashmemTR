import type { Half, Level } from "./types";

export interface SlotSeed {
  id: string;
  half: Half | null;
}

export interface DealtSlot extends SlotSeed {
  value: number;
  correct: boolean | null;
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = next[i];
    next[i] = next[j];
    next[j] = swap;
  }
  return next;
}

/** コントローラーを含めるか、左右2分割かで、数字を置く枠を作る。 */
export function buildSlots(ids: string[], centerNumber: boolean, split: boolean): SlotSeed[] {
  const owners = [...(centerNumber ? ["center"] : []), ...ids];
  const halves: Array<Half | null> = split ? ["left", "right"] : [null];
  return owners.flatMap((id) => halves.map((half) => ({ id, half })));
}

/**
 * 簡単は 1 からの連番をばらまく。
 * 難しいは 0〜99 の重複なし。1桁だけに偏ったときは2桁を1つ入れる。
 */
export function dealValues(count: number, level: Level, rng: () => number): number[] {
  if (count <= 0) return [];
  if (level === "easy") {
    return shuffle(
      Array.from({ length: count }, (_, index) => index + 1),
      rng
    );
  }
  const picked = shuffle(
    Array.from({ length: 100 }, (_, index) => index),
    rng
  ).slice(0, count);
  if (picked.every((value) => value < 10)) {
    let two = 10 + Math.floor(rng() * 90);
    while (picked.includes(two)) two = 10 + ((two - 10 + 1) % 90);
    picked[0] = two;
  }
  return picked;
}

export function deal(
  ids: string[],
  centerNumber: boolean,
  split: boolean,
  level: Level,
  rng: () => number
): DealtSlot[] {
  const seeds = buildSlots(ids, centerNumber, split);
  const values = dealValues(seeds.length, level, rng);
  return seeds.map((seed, index) => ({
    ...seed,
    value: values[index] ?? index + 1,
    correct: null,
  }));
}

export function samePlace(slot: SlotSeed, id: string, half: Half | null): boolean {
  return slot.id === id && (slot.half ?? null) === (half ?? null);
}
