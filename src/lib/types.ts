export type Role = "controller" | "display";
export type Level = "easy" | "hard";
export type Half = "left" | "right";
export type Phase = "idle" | "flash" | "answer" | "review";

export interface RoomConfig {
  level: Level;
  /** 数字を出しておく長さ。0.1〜1秒 */
  flashSeconds: number;
  /** コントローラーにも数字を出す */
  centerNumber: boolean;
  /** 各端末を左右に分け、数字を2つ出す */
  split: boolean;
  running: boolean;
}

export interface DisplayInfo {
  id: string;
  label: string;
  place: number;
  connected: boolean;
}

export interface SlotView {
  id: string;
  half: Half | null;
  /** 答え合わせ中は場所が分からないよう、数値を配らない */
  value: number | null;
  correct: boolean | null;
}

export interface RoomSnapshot {
  code: string;
  config: RoomConfig;
  displays: DisplayInfo[];
  phase: Phase;
  slots: SlotView[];
  /** 今、探している数字 */
  prompt: number | null;
  /** すでに答えた数 */
  asked: number;
  questionTotal: number;
  correct: number;
  flashStartedAt: number | null;
  flashEndsAt: number | null;
  finishedAt: number | null;
  serverNow: number;
}

export type ClientMessage =
  | { type: "hello"; role: Role; deviceId: string; label?: string }
  | { type: "updateConfig"; config: Partial<RoomConfig> }
  | { type: "setLabel"; deviceId: string; label: string }
  | { type: "start" }
  | { type: "stop" }
  | { type: "tap"; deviceId: string; half?: Half | null }
  | { type: "ping" };

export type ServerMessage =
  | { type: "snapshot"; snapshot: RoomSnapshot }
  | { type: "error"; message: string }
  | { type: "pong" };

export const DEFAULT_CONFIG: RoomConfig = {
  level: "easy",
  flashSeconds: 0.5,
  centerNumber: false,
  split: false,
  running: false,
};

export const MIN_PERIPHERALS = 2;
export const MAX_PERIPHERALS = 6;
export const MIN_FLASH = 0.1;
export const MAX_FLASH = 1;

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
