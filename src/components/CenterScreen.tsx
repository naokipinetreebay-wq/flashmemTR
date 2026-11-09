"use client";

import { useEffect, useRef, useState } from "react";
import { countdownDigit } from "@/lib/localEngine";
import type { ClientMessage, Half, RoomSnapshot, SlotView } from "@/lib/types";

function useWakeLock() {
  useEffect(() => {
    let wake: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator) wake = await navigator.wakeLock.request("screen");
      } catch {
        /* ignore */
      }
    };
    request();
    const onVis = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      wake?.release().catch(() => undefined);
    };
  }, []);
}

function mark(slot: SlotView) {
  if (slot.correct === true) return "○";
  if (slot.correct === false || slot.picked) return "×";
  return "";
}

function tone(slot: SlotView, colored: boolean) {
  if (!colored) return "";
  if (slot.correct === true) return "cue-green";
  if (slot.correct === false || slot.picked) return "cue-red";
  return "";
}

function Digit({ slot, colored }: { slot: SlotView; colored: boolean }) {
  const value = slot.value ?? "";
  const compact = typeof slot.value === "number" && slot.value >= 10;
  const badge = colored ? mark(slot) : "";
  return (
    <span className={`peri-digit ${compact ? "compact" : ""} ${tone(slot, colored)}`}>
      {value}
      {badge ? <span className="flash-mark">{badge}</span> : null}
    </span>
  );
}

export function CenterScreen({
  snapshot,
  send,
  onBeginAnswer,
  onOpenReview,
  onReviewStep,
  onTap,
}: {
  snapshot: RoomSnapshot;
  send?: (msg: ClientMessage) => void;
  onBeginAnswer?: () => void;
  onOpenReview?: () => void;
  onReviewStep?: (delta: number) => void;
  onTap?: (deviceId: string, half: Half | null) => void;
}) {
  useWakeLock();
  const [, setClock] = useState(0);
  const skewRef = useRef(0);
  const seen = useRef<number | null>(null);
  if (seen.current !== snapshot.serverNow) {
    seen.current = snapshot.serverNow;
    skewRef.current = snapshot.serverNow - Date.now();
  }

  const pkg = snapshot.playPackage;
  const flashEndsAt = pkg?.flashEndsAt ?? snapshot.flashEndsAt;
  const flashStartedAt = pkg?.flashStartedAt ?? snapshot.flashStartedAt;

  useEffect(() => {
    if (snapshot.phase !== "countdown" && snapshot.phase !== "flash") return;
    const now = Date.now() + skewRef.current;
    const nextAt =
      snapshot.phase === "countdown" && pkg
        ? Math.min(
            pkg.countdownStartedAt +
              (pkg.countdownFrom - (countdownDigit(pkg, now) ?? 1) + 1) * pkg.countdownMs,
            pkg.flashStartedAt
          )
        : flashEndsAt;
    if (nextAt == null) return;
    const id = setTimeout(() => setClock((n) => n + 1), Math.max(0, nextAt - now));
    return () => clearTimeout(id);
  }, [flashEndsAt, flashStartedAt, pkg, snapshot.phase, snapshot.serverNow]);

  const centerSlots = snapshot.slots.filter((slot) => slot.id === "center");
  const now = Date.now() + skewRef.current;
  const count = pkg ? countdownDigit(pkg, now) : null;
  const showing =
    (snapshot.phase === "flash" ||
      (snapshot.phase === "countdown" && count == null && flashStartedAt != null && now >= flashStartedAt)) &&
    (flashEndsAt == null || now < flashEndsAt);
  const split = centerSlots.length > 1;

  const tap = (half: Half | null) => {
    if (onTap) onTap("center", half);
    else send?.({ type: "tap", deviceId: "center", half });
  };

  if (snapshot.phase === "countdown" && count != null) {
    return (
      <div className="peri-center flash-countdown">
        <span className="flash-countdown-digit">{count}</span>
      </div>
    );
  }

  if (snapshot.phase === "ready") {
    return (
      <div className="peri-center flash-ready">
        <p className="muted">覚えましたか？</p>
        <button type="button" className="btn primary" onClick={() => onBeginAnswer?.()}>
          回答する
        </button>
      </div>
    );
  }

  if (snapshot.phase === "result") {
    return (
      <div className="peri-center flash-review">
        <span className="peri-result">
          <span className="peri-result-label">正答</span>
          <span className="peri-score">
            {snapshot.correct}
            <span className="peri-score-denom">/{snapshot.questionTotal}</span>
          </span>
        </span>
        <button type="button" className="btn" onClick={() => onOpenReview?.()}>
          答え合わせを見る
        </button>
      </div>
    );
  }

  if (snapshot.phase === "review") {
    const answer =
      snapshot.reviewIndex != null ? snapshot.answers[snapshot.reviewIndex] : null;
    return (
      <div className="peri-center flash-review">
        <div className="flash-prompt">
          <span className="flash-prompt-label">答え合わせ</span>
          <span className={`peri-digit ${answer && answer.prompt >= 10 ? "compact" : ""}`}>
            {answer?.prompt ?? snapshot.prompt ?? ""}
          </span>
          <span className="flash-progress">
            {(snapshot.reviewIndex ?? 0) + 1}/{snapshot.answers.length || snapshot.questionTotal}
          </span>
          <span className={`flash-verdict ${answer?.hit ? "ok" : "bad"}`}>
            {answer?.hit ? "○" : "×"}
          </span>
        </div>
        {centerSlots.length > 0 ? (
          split ? (
            <div className="flash-split flash-split-review">
              {centerSlots.map((slot) => (
                <div key={slot.half ?? "only"} className="flash-half">
                  <Digit slot={slot} colored />
                </div>
              ))}
            </div>
          ) : centerSlots[0] ? (
            <Digit slot={centerSlots[0]} colored />
          ) : null
        ) : null}
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={(snapshot.reviewIndex ?? 0) <= 0}
            onClick={() => onReviewStep?.(-1)}
          >
            前へ
          </button>
          <button
            type="button"
            className="btn"
            disabled={
              snapshot.reviewIndex == null ||
              snapshot.reviewIndex >= (snapshot.answers.length || 1) - 1
            }
            onClick={() => onReviewStep?.(1)}
          >
            次へ
          </button>
        </div>
      </div>
    );
  }

  if (snapshot.phase === "answer") {
    return (
      <div className="peri-center flash-answer">
        <div className="flash-prompt">
          <span className="flash-prompt-label">この数字の場所</span>
          <span className={`peri-digit ${snapshot.prompt != null && snapshot.prompt >= 10 ? "compact" : ""}`}>
            {snapshot.prompt ?? ""}
          </span>
          <span className="flash-progress">
            {Math.min(snapshot.questionTotal, snapshot.asked + 1)}/{snapshot.questionTotal}
          </span>
        </div>
        {centerSlots.length > 0 ? (
          split ? (
            <div className="flash-split flash-targets">
              <button type="button" className="flash-half" onPointerDown={() => tap("left")}>
                左
              </button>
              <button type="button" className="flash-half" onPointerDown={() => tap("right")}>
                右
              </button>
            </div>
          ) : (
            <button type="button" className="flash-self" onPointerDown={() => tap(null)}>
              この端末
            </button>
          )
        ) : null}
      </div>
    );
  }

  if (showing && centerSlots.length > 0) {
    if (split) {
      return (
        <div className="flash-split">
          {centerSlots.map((slot) => (
            <div key={slot.half ?? "only"} className="flash-half">
              <Digit slot={slot} colored={false} />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="peri-center">
        <Digit slot={centerSlots[0]} colored={false} />
      </div>
    );
  }

  return <div className="peri-center" />;
}
