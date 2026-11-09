"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  applyTap,
  buildFlashPackage,
  createLocalGame,
  idsFromSnapshot,
  overlayForPhase,
  type HostOverlay,
  type LocalGame,
} from "./localEngine";
import type {
  ClientEventMessage,
  ClientMessage,
  Half,
  RoomSnapshot,
} from "./types";

const CLOCK_MS = 3000;

export function useFlashMemLocalHost(
  snapshot: RoomSnapshot | null,
  send: (msg: ClientMessage) => void,
  clientEvent: ClientEventMessage | null
) {
  const overlayRef = useRef<HostOverlay | null>(null);
  const gameRef = useRef<LocalGame | null>(null);
  const pkgRef = useRef<ReturnType<typeof buildFlashPackage> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventRef = useRef<ClientEventMessage | null>(null);

  const clearTimers = useCallback(() => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (readyTimer.current) clearTimeout(readyTimer.current);
    flashTimer.current = null;
    readyTimer.current = null;
  }, []);

  const push = useCallback(
    (overlay: HostOverlay) => {
      overlayRef.current = overlay;
      send({ type: "hostPush", overlay });
    },
    [send]
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!snapshot?.config.running) return;
    const tick = () => {
      const prev = overlayRef.current;
      if (!prev) return;
      push({ ...prev, hostNow: Date.now() });
    };
    const id = setInterval(tick, CLOCK_MS);
    return () => clearInterval(id);
  }, [snapshot?.config.running, push]);

  const stopLocal = useCallback(() => {
    clearTimers();
    overlayRef.current = null;
    gameRef.current = null;
    pkgRef.current = null;
    send({ type: "stop" });
  }, [send, clearTimers]);

  const startLocal = useCallback(() => {
    if (!snapshot) return;
    clearTimers();
    send({ type: "start", local: true });

    const ids = idsFromSnapshot(snapshot);
    const game = createLocalGame(ids, snapshot.config);
    const pkg = buildFlashPackage(snapshot.config);
    gameRef.current = game;
    pkgRef.current = pkg;

    push(overlayForPhase(game, "countdown", pkg));

    flashTimer.current = setTimeout(() => {
      const g = gameRef.current;
      const p = pkgRef.current;
      if (!g || !p) return;
      push(overlayForPhase(g, "flash", p));
    }, Math.max(0, pkg.flashStartedAt - Date.now()));

    readyTimer.current = setTimeout(() => {
      const g = gameRef.current;
      const p = pkgRef.current;
      if (!g || !p) return;
      push(overlayForPhase(g, "ready", p));
    }, Math.max(0, pkg.flashEndsAt - Date.now()));
  }, [snapshot, send, push, clearTimers]);

  const beginAnswer = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    push(overlayForPhase(g, "answer", null));
  }, [push]);

  const openReview = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.answers.length === 0) return;
    push(overlayForPhase(g, "review", null, { reviewIndex: 0 }));
  }, [push]);

  const reviewStep = useCallback(
    (delta: number) => {
      const g = gameRef.current;
      const prev = overlayRef.current;
      if (!g || !prev || prev.phase !== "review") return;
      const next = Math.max(
        0,
        Math.min(g.answers.length - 1, (prev.reviewIndex ?? 0) + delta)
      );
      push(overlayForPhase(g, "review", null, { reviewIndex: next }));
    },
    [push]
  );

  // 端末タップをコントローラ側で採点
  useEffect(() => {
    if (!clientEvent || clientEvent === lastEventRef.current) return;
    lastEventRef.current = clientEvent;
    if (clientEvent.event !== "tap") return;
    const prev = overlayRef.current;
    if (!prev || prev.phase !== "answer") return;
    const g = gameRef.current;
    if (!g) return;
    const next = applyTap(g, clientEvent.deviceId, clientEvent.half);
    if (!next) return;
    gameRef.current = next;
    if (next.promptIndex >= next.order.length) {
      push(
        overlayForPhase(next, "result", null, {
          finishedAt: Date.now(),
        })
      );
      return;
    }
    push(overlayForPhase(next, "answer", null));
  }, [clientEvent, push]);

  const tapLocal = useCallback(
    (deviceId: string, half: Half | null) => {
      const prev = overlayRef.current;
      if (!prev || prev.phase !== "answer") return;
      const g = gameRef.current;
      if (!g) return;
      const next = applyTap(g, deviceId, half);
      if (!next) return;
      gameRef.current = next;
      if (next.promptIndex >= next.order.length) {
        push(
          overlayForPhase(next, "result", null, {
            finishedAt: Date.now(),
          })
        );
        return;
      }
      push(overlayForPhase(next, "answer", null));
    },
    [push]
  );

  return {
    startLocal,
    stopLocal,
    beginAnswer,
    openReview,
    reviewStep,
    tapLocal,
  };
}
