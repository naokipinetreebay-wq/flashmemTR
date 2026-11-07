"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomSnapshot, SlotView } from "@/lib/types";

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

function tone(slot: SlotView, colored: boolean) {
  if (!colored) return "";
  if (slot.correct === true) return "cue-green";
  if (slot.correct === false) return "cue-red";
  return "";
}

function Digit({ slot, colored }: { slot: SlotView; colored: boolean }) {
  const value = slot.value ?? "";
  const compact = typeof slot.value === "number" && slot.value >= 10;
  return <span className={`peri-digit ${compact ? "compact" : ""} ${tone(slot, colored)}`}>{value}</span>;
}

export function CenterScreen({
  snapshot,
  send,
}: {
  snapshot: RoomSnapshot;
  send?: (msg: ClientMessage) => void;
}) {
  useWakeLock();
  const [, setClock] = useState(0);
  const skewRef = useRef(0);
  const seen = useRef<number | null>(null);
  if (seen.current !== snapshot.serverNow) {
    seen.current = snapshot.serverNow;
    skewRef.current = snapshot.serverNow - Date.now();
  }

  const flashEndsAt = snapshot.playPackage?.flashEndsAt ?? snapshot.flashEndsAt;

  useEffect(() => {
    if (snapshot.phase !== "flash" || flashEndsAt == null) return;
    const delay = flashEndsAt - (Date.now() + skewRef.current);
    const id = setTimeout(() => setClock((n) => n + 1), Math.max(0, delay));
    return () => clearTimeout(id);
  }, [flashEndsAt, snapshot.phase, snapshot.serverNow]);

  const centerSlots = snapshot.slots.filter((slot) => slot.id === "center");
  const now = Date.now() + skewRef.current;
  const showing = snapshot.phase === "flash" && (flashEndsAt == null || now < flashEndsAt);
  const split = centerSlots.length > 1;

  const tap = (half: "left" | "right" | null) => {
    send?.({ type: "tap", deviceId: "center", half });
  };

  if (snapshot.phase === "review") {
    return (
      <div className="peri-center flash-review">
        {split ? (
          <div className="flash-split flash-split-review">
            {centerSlots.map((slot) => (
              <div key={slot.half ?? "only"} className="flash-half">
                <Digit slot={slot} colored />
              </div>
            ))}
          </div>
        ) : centerSlots[0] ? (
          <Digit slot={centerSlots[0]} colored />
        ) : null}
        <span className="peri-result">
          <span className="peri-result-label">正答</span>
          <span className="peri-score">
            {snapshot.correct}
            <span className="peri-score-denom">/{snapshot.questionTotal}</span>
          </span>
        </span>
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
