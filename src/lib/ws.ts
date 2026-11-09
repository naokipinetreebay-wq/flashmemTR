"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HostOverlay } from "./localEngine";
import { LocalMesh, type SignalEnvelope } from "./localMesh";
import type {
  ClientEventMessage,
  ClientMessage,
  Role,
  RoomSnapshot,
  ServerMessage,
} from "./types";

const PING_MS = 12_000;
const RETRY_BASE_MS = 600;
const RETRY_MAX_MS = 8_000;

/** ルーム参加・シグナリングは Cloudflare。プレー中のゲーム通信は WebRTC。 */
export const TR_ROOMS_HOST = "tr-api.rojiura.app";

function wsUrl(room: string, role: Role, deviceId: string): string {
  const q = new URLSearchParams({ room, role, deviceId, app: "flashmem" });
  return `wss://${TR_ROOMS_HOST}/ws?${q}`;
}

function mergeOverlay(base: RoomSnapshot, overlay: Partial<HostOverlay>): RoomSnapshot {
  const phase = overlay.phase ?? base.phase;
  return {
    ...base,
    config: {
      ...base.config,
      running: overlay.running != null ? overlay.running : base.config.running,
    },
    phase,
    slots: overlay.slots ?? base.slots,
    prompt: overlay.prompt !== undefined ? overlay.prompt : base.prompt,
    asked: overlay.asked ?? base.asked,
    questionTotal:
      overlay.questionTotal ?? (overlay.slots?.length || base.questionTotal),
    correct: overlay.correct ?? base.correct,
    flashStartedAt: overlay.flashStartedAt ?? base.flashStartedAt,
    flashEndsAt: overlay.flashEndsAt ?? base.flashEndsAt,
    finishedAt:
      overlay.finishedAt !== undefined ? overlay.finishedAt : base.finishedAt,
    playPackage:
      phase === "countdown" || phase === "flash"
        ? overlay.playPackage !== undefined
          ? overlay.playPackage
          : base.playPackage
        : null,
    reviewIndex:
      overlay.reviewIndex !== undefined ? overlay.reviewIndex : base.reviewIndex,
    answers: overlay.answers ?? base.answers,
    serverNow: overlay.hostNow ?? base.serverNow,
  };
}

/** この snapshot が来たらローカル overlay は捨てる（停止・初期化と同期）。 */
function shouldResetOverlay(snapshot: RoomSnapshot): boolean {
  return snapshot.phase === "idle";
}

export function useDeviceId(key: string): string {
  const [id, setId] = useState("");
  useEffect(() => {
    const storageKey = `fm-device-${key}`;
    let existing = localStorage.getItem(storageKey);
    if (!existing) {
      existing = crypto.randomUUID();
      localStorage.setItem(storageKey, existing);
    }
    setId(existing);
  }, [key]);
  return id;
}

export function useRoomSocket(room: string, role: Role, deviceId: string) {
  const [baseSnapshot, setBaseSnapshot] = useState<RoomSnapshot | null>(null);
  const [overlay, setOverlay] = useState<Partial<HostOverlay> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [meshReady, setMeshReady] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const meshRef = useRef<LocalMesh | null>(null);
  const [clientEvent, setClientEvent] = useState<ClientEventMessage | null>(null);

  const snapshot = useMemo(() => {
    if (!baseSnapshot) return null;
    if (!overlay) return baseSnapshot;
    return mergeOverlay(baseSnapshot, overlay);
  }, [baseSnapshot, overlay]);

  useEffect(() => {
    if (!room || !deviceId) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

    const sendSignal = (env: SignalEnvelope) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(env));
      }
    };

    const mesh = new LocalMesh({
      role,
      deviceId,
      sendSignal,
      onGameMessage: (msg) => {
        const m = msg as ServerMessage | ClientMessage;
        if (m && typeof m === "object" && "type" in m) {
          if (m.type === "hostPush") {
            setOverlay((prev) => ({
              ...(prev ?? {}),
              ...(m.overlay as Partial<HostOverlay>),
            }));
            setMeshReady((n) => n + 1);
            return;
          }
          if (m.type === "clientEvent") {
            setClientEvent(m as ClientEventMessage);
            return;
          }
        }
      },
    });
    meshRef.current = mesh;

    const clearRetry = () => {
      if (retry) {
        clearTimeout(retry);
        retry = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed || retry) return;
      const delay = Math.min(
        RETRY_MAX_MS,
        RETRY_BASE_MS * Math.pow(1.7, attempt) + Math.random() * 200
      );
      attempt += 1;
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (closed) return;
      clearRetry();
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      const ws = new WebSocket(wsUrl(room, role, deviceId));
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        setError(null);
        try {
          ws.send(JSON.stringify({ type: "ping" } satisfies ClientMessage));
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) scheduleReconnect();
      };
      ws.onerror = () => setError("接続エラー");
      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === "snapshot") {
          const snapshot = msg.snapshot;
          if (shouldResetOverlay(snapshot)) setOverlay(null);
          setBaseSnapshot(snapshot);
          if (role === "controller") {
            for (const d of snapshot.displays) {
              void mesh.ensurePeer(d.id);
            }
          }
        }
        if (msg.type === "signal") {
          void mesh.handleSignal(msg as SignalEnvelope);
        }
        if (msg.type === "clientEvent") {
          setClientEvent(msg);
        }
        if (msg.type === "error") setError(msg.message);
        if (msg.type === "pong") setError(null);
      };
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || closed) return;
      const state = wsRef.current?.readyState;
      if (state !== WebSocket.OPEN && state !== WebSocket.CONNECTING) {
        connect();
      } else if (state === WebSocket.OPEN) {
        try {
          wsRef.current?.send(
            JSON.stringify({ type: "ping" } satisfies ClientMessage)
          );
        } catch {
          /* ignore */
        }
      }
    };

    connect();
    ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(
            JSON.stringify({ type: "ping" } satisfies ClientMessage)
          );
        } catch {
          /* ignore */
        }
      } else if (!closed) {
        scheduleReconnect();
      }
    }, PING_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onVisibility);

    return () => {
      closed = true;
      clearRetry();
      if (ping) clearInterval(ping);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onVisibility);
      mesh.destroy();
      meshRef.current = null;
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
    };
  }, [room, role, deviceId]);

  const send = useCallback((msg: ClientMessage) => {
    const mesh = meshRef.current;
    // プレー配信は WebRTC 優先（これがローカル化）。未接続ピア向けに WS も送る。
    if (msg.type === "hostPush") {
      setOverlay((prev) => ({
        ...(prev ?? {}),
        ...(msg.overlay as Partial<HostOverlay>),
      }));
      mesh?.broadcastGame(msg);
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  /**
   * タップ等のゲームイベント: DataChannel 優先（参加端末→コントローラ）。
   * DC が無いときは WS の "tap" にフォールバック（サーバが clientEvent に中継）。
   */
  const sendGame = useCallback((msg: unknown) => {
    const mesh = meshRef.current;
    if (role === "display") {
      if (mesh?.sendGameToController(msg)) return true;
    } else if (mesh?.broadcastGame(msg)) {
      return true;
    }
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      const m = msg as { type?: string; event?: string } & Record<string, unknown>;
      if (m.type === "clientEvent" && m.event === "tap") {
        const { type: _type, event: _event, ...rest } = m;
        void _type;
        void _event;
        ws.send(JSON.stringify({ type: "tap", ...rest }));
      } else {
        ws.send(JSON.stringify(msg));
      }
      return true;
    }
    return false;
  }, [role]);

  return {
    snapshot,
    error,
    connected,
    send,
    sendGame,
    clientEvent,
    meshPeers: meshReady,
  };
}

export async function createRoom(): Promise<string> {
  const res = await fetch(`https://${TR_ROOMS_HOST}/v1/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app: "flashmem" }),
  });
  if (!res.ok) throw new Error("ルーム作成に失敗しました");
  const data = (await res.json()) as { code: string };
  return data.code;
}
