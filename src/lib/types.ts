export type Role = "controller" | "display";
export type Level = "easy" | "hard";
export type Half = "left" | "right";
/** countdown→flash→ready→answer→result→review */
export type Phase =
  | "idle"
  | "countdown"
  | "flash"
  | "ready"
  | "answer"
  | "result"
  | "review";

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
  /** 答え合わせ: ユーザーがこの枠を選んだか */
  picked: boolean | null;
}

/** カウントダウン〜フラッシュ窓。端末時計で再生する正本 */
export interface PlayPackage {
  countdownStartedAt: number;
  countdownFrom: number;
  countdownMs: number;
  flashStartedAt: number;
  flashEndsAt: number;
}

export interface AnswerRecord {
  prompt: number;
  correctId: string;
  correctHalf: Half | null;
  userId: string;
  userHalf: Half | null;
  hit: boolean;
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
  playPackage: PlayPackage | null;
  /** 答え合わせの何問目（0始まり）。review 以外は null */
  reviewIndex: number | null;
  answers: AnswerRecord[];
  serverNow: number;
}

export type ClientMessage =
  | { type: "hello"; role: Role; deviceId: string; label?: string }
  | { type: "updateConfig"; config: Partial<RoomConfig> }
  | { type: "setLabel"; deviceId: string; label: string }
  | { type: "start"; local?: boolean }
  | { type: "stop" }
  | { type: "tap"; deviceId: string; half?: Half | null }
  | {
      type: "hostPush";
      overlay: {
        playPackage?: PlayPackage | null;
        phase?: Phase;
        slots?: SlotView[];
        prompt?: number | null;
        asked?: number;
        questionTotal?: number;
        correct?: number;
        flashStartedAt?: number | null;
        flashEndsAt?: number | null;
        finishedAt?: number | null;
        reviewIndex?: number | null;
        answers?: AnswerRecord[];
        hostNow?: number;
        running?: boolean;
      };
    }
  | {
      type: "signal";
      from: string;
      to: string;
      payload: unknown;
    }
  | { type: "ping" };

export type ClientEventMessage = {
  type: "clientEvent";
  event: "tap";
  deviceId: string;
  half: Half | null;
};

export type ServerMessage =
  | { type: "snapshot"; snapshot: RoomSnapshot }
  | ClientEventMessage
  | { type: "error"; message: string }
  | { type: "pong" }
  | {
      type: "signal";
      from: string;
      to: string;
      payload: unknown;
    };

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

export const COUNTDOWN_FROM = 3;
export const COUNTDOWN_MS = 1000;

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
