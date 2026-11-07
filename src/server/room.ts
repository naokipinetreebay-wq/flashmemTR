import { WebSocket } from "ws";
import { deal, samePlace, shuffle, type DealtSlot } from "../lib/deal";
import {
  DEFAULT_CONFIG,
  MAX_FLASH,
  MAX_PERIPHERALS,
  MIN_FLASH,
  MIN_PERIPHERALS,
  clamp,
  type DisplayInfo,
  type Half,
  type Phase,
  type RoomConfig,
  type RoomSnapshot,
  type SlotView,
} from "../lib/types";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_MS = 90 * 60 * 1000;
const TAP_GAP_MS = 120;

function randomCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export type ClientSocket = WebSocket & {
  role?: "controller" | "display";
  deviceId?: string;
  roomCode?: string;
};

interface DisplayClient {
  id: string;
  label: string;
  place: number;
  socket: ClientSocket | null;
}

export class Room {
  code: string;
  config: RoomConfig = { ...DEFAULT_CONFIG };
  displays = new Map<string, DisplayClient>();
  controllers = new Set<ClientSocket>();
  phase: Phase = "idle";
  prompt: number | null = null;
  asked = 0;
  correct = 0;
  flashStartedAt: number | null = null;
  flashEndsAt: number | null = null;
  playPackage: { flashStartedAt: number; flashEndsAt: number } | null = null;
  finishedAt: number | null = null;
  lastActivity = Date.now();
  rng: () => number = Math.random;

  private slots: DealtSlot[] = [];
  private order: number[] = [];
  private promptIndex = 0;
  private lastTapAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  isExpired(now = Date.now()) {
    if (this.config.running) return false;
    if (this.controllers.size > 0) return false;
    if ([...this.displays.values()].some((d) => d.socket)) return false;
    return now - this.lastActivity > ROOM_TTL_MS;
  }

  addController(socket: ClientSocket) {
    this.controllers.add(socket);
    this.touch();
    this.sendSnapshot(socket);
  }

  removeController(socket: ClientSocket) {
    this.controllers.delete(socket);
  }

  addDisplay(socket: ClientSocket, deviceId: string, label?: string) {
    this.touch();
    const existing = this.displays.get(deviceId);
    if (existing) {
      existing.socket = socket;
      if (label) existing.label = label;
      this.broadcast();
      return { ok: true as const };
    }
    if (this.displays.size >= MAX_PERIPHERALS) {
      return { ok: false as const, error: "周囲の端末は6台までです" };
    }
    const place = this.displays.size + 1;
    this.displays.set(deviceId, {
      id: deviceId,
      label: label || `No.${place}`,
      place,
      socket,
    });
    this.broadcast();
    return { ok: true as const };
  }

  removeDisplaySocket(socket: ClientSocket) {
    for (const d of this.displays.values()) {
      if (d.socket === socket) {
        d.socket = null;
        break;
      }
    }
    this.broadcast();
  }

  setLabel(deviceId: string, label: string) {
    const d = this.displays.get(deviceId);
    if (d) {
      d.label = label.slice(0, 24);
      this.touch();
      this.broadcast();
    }
  }

  updateConfig(partial: Partial<RoomConfig>) {
    if (this.config.running) {
      this.broadcast();
      return;
    }
    const next = { ...this.config, ...partial, running: false };
    next.level = next.level === "hard" ? "hard" : "easy";
    next.flashSeconds = clamp(Math.round(next.flashSeconds * 10) / 10, MIN_FLASH, MAX_FLASH);
    next.centerNumber = !!next.centerNumber;
    next.split = !!next.split;
    this.config = next;
    this.touch();
    this.broadcast();
  }

  private liveIds(): string[] {
    return [...this.displays.values()]
      .filter((d) => d.socket && d.socket.readyState === WebSocket.OPEN)
      .map((d) => d.id);
  }

  private hasController(): boolean {
    return [...this.controllers].some((socket) => socket.readyState === WebSocket.OPEN);
  }

  start() {
    const ids = this.liveIds();
    if (!this.hasController() || ids.length < MIN_PERIPHERALS || this.displays.size > MAX_PERIPHERALS) {
      this.broadcast();
      return;
    }
    this.clearTimer();
    this.slots = deal(ids, this.config.centerNumber, this.config.split, this.config.level, this.rng);
    this.order = shuffle(this.slots.map((_, index) => index), this.rng);
    this.promptIndex = 0;
    this.prompt = null;
    this.asked = 0;
    this.correct = 0;
    this.finishedAt = null;
    this.lastTapAt = 0;
    this.phase = "flash";
    this.config.running = true;
    this.flashStartedAt = Date.now();
    this.flashEndsAt = this.flashStartedAt + Math.round(this.config.flashSeconds * 1000);
    this.playPackage = {
      flashStartedAt: this.flashStartedAt,
      flashEndsAt: this.flashEndsAt,
    };
    this.touch();
    this.broadcast();
    const wait = Math.max(0, this.flashEndsAt - Date.now());
    this.timer = setTimeout(() => this.openAnswers(), wait);
  }

  stop() {
    this.clearTimer();
    this.config.running = false;
    this.phase = "idle";
    this.slots = [];
    this.order = [];
    this.prompt = null;
    this.promptIndex = 0;
    this.asked = 0;
    this.correct = 0;
    this.flashStartedAt = null;
    this.flashEndsAt = null;
    this.playPackage = null;
    this.finishedAt = null;
    this.touch();
    this.broadcast();
  }

  tap(deviceId: string, half: Half | null) {
    if (this.phase !== "answer") return;
    const now = Date.now();
    if (now - this.lastTapAt < TAP_GAP_MS) return;
    const slot = this.slots[this.order[this.promptIndex]];
    if (!slot) return;
    this.lastTapAt = now;
    const hit = samePlace(slot, deviceId, half);
    slot.correct = hit;
    if (hit) this.correct += 1;
    this.asked += 1;
    this.promptIndex += 1;
    if (this.promptIndex >= this.order.length) {
      this.phase = "review";
      this.config.running = false;
      this.finishedAt = Date.now();
      this.prompt = null;
    } else {
      this.prompt = this.slots[this.order[this.promptIndex]]?.value ?? null;
    }
    this.touch();
    this.broadcast();
  }

  /** テスト用。答えの場所はスナップショットに出さない。 */
  secretCurrent(): DealtSlot | null {
    if (this.phase !== "answer") return null;
    return this.slots[this.order[this.promptIndex]] ?? null;
  }

  secretSlots(): DealtSlot[] {
    return this.slots.map((slot) => ({ ...slot }));
  }

  private openAnswers() {
    if (this.phase !== "flash") return;
    this.phase = "answer";
    this.prompt = this.slots[this.order[0]]?.value ?? null;
    this.touch();
    this.broadcast();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  snapshot(): RoomSnapshot {
    const displays: DisplayInfo[] = [...this.displays.values()].map((d) => ({
      id: d.id,
      label: d.label,
      place: d.place,
      connected: !!d.socket && d.socket.readyState === WebSocket.OPEN,
    }));
    const hideValues = this.phase === "answer";
    const slots: SlotView[] = this.slots.map((slot) => ({
      id: slot.id,
      half: slot.half,
      value: hideValues ? null : slot.value,
      correct: slot.correct,
    }));
    return {
      code: this.code,
      config: this.config,
      displays,
      phase: this.phase,
      slots,
      prompt: this.prompt,
      asked: this.asked,
      questionTotal: this.slots.length,
      correct: this.correct,
      flashStartedAt: this.flashStartedAt,
      flashEndsAt: this.flashEndsAt,
      finishedAt: this.finishedAt,
      playPackage: this.phase === "flash" ? this.playPackage : null,
      serverNow: Date.now(),
    };
  }

  sendSnapshot(socket: ClientSocket) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "snapshot", snapshot: this.snapshot() }));
    }
  }

  broadcast() {
    const payload = JSON.stringify({ type: "snapshot", snapshot: this.snapshot() });
    for (const c of this.controllers) {
      if (c.readyState === WebSocket.OPEN) c.send(payload);
    }
    for (const d of this.displays.values()) {
      if (d.socket && d.socket.readyState === WebSocket.OPEN) d.socket.send(payload);
    }
  }

  destroy() {
    this.clearTimer();
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();

  createRoom(): Room {
    let code = randomCode();
    while (this.rooms.has(code)) code = randomCode();
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    const room = this.rooms.get(code.toUpperCase());
    if (room?.isExpired()) {
      room.destroy();
      this.rooms.delete(room.code);
      return undefined;
    }
    return room;
  }

  sweep() {
    for (const [code, room] of this.rooms) {
      if (room.isExpired()) {
        room.destroy();
        this.rooms.delete(code);
      }
    }
  }
}
