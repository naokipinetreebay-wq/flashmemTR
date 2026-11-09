"use client";

import { useEffect, useRef, useState } from "react";
import { countdownDigit } from "@/lib/localEngine";
import { placementsFor } from "@/lib/placement";
import type { ClientMessage, RoomSnapshot, SlotView } from "@/lib/types";

function mark(slot: SlotView) {
  if (slot.correct === true) return "○";
  if (slot.correct === false || slot.picked) return "×";
  return "";
}

function tone(slot: SlotView) {
  if (slot.correct === true) return "cue-green";
  if (slot.correct === false || slot.picked) return "cue-red";
  return "";
}

function Digit({ slot, colored }: { slot: SlotView; colored: boolean }) {
  const compact = typeof slot.value === "number" && slot.value >= 10;
  const badge = colored ? mark(slot) : "";
  return (
    <span className={`peri-digit ${compact ? "compact" : ""} ${colored ? tone(slot) : ""}`}>
      {slot.value ?? ""}
      {badge ? <span className="flash-mark">{badge}</span> : null}
    </span>
  );
}

export function DisplayScreen({
  snapshot,
  deviceId,
  send,
}: {
  snapshot: RoomSnapshot;
  deviceId: string;
  send: (msg: ClientMessage) => void;
}) {
  const mine = snapshot.displays.find((d) => d.id === deviceId);
  const mineSlots = snapshot.slots.filter((slot) => slot.id === deviceId);
  const split = mineSlots.length > 1 || (snapshot.config.split && snapshot.phase !== "idle");
  const clock = placementsFor(snapshot.displays.length).find((slot) => slot.no === mine?.place)?.clock;
  const [, setClock] = useState(0);
  const skewRef = useRef(0);
  const seen = useRef<number | null>(null);
  const lock = useRef(0);
  if (seen.current !== snapshot.serverNow) {
    seen.current = snapshot.serverNow;
    skewRef.current = snapshot.serverNow - Date.now();
  }

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

  const pkg = snapshot.playPackage;
  const flashEndsAt = pkg?.flashEndsAt ?? snapshot.flashEndsAt;
  const flashStartedAt = pkg?.flashStartedAt ?? snapshot.flashStartedAt;

  useEffect(() => {
    if (snapshot.phase !== "countdown" && snapshot.phase !== "flash") return;
    const now = Date.now() + skewRef.current;
    const nextAt =
      snapshot.phase === "countdown" && pkg
        ? pkg.flashStartedAt
        : flashEndsAt;
    if (nextAt == null) return;
    const id = setTimeout(() => setClock((n) => n + 1), Math.max(0, nextAt - now));
    return () => clearTimeout(id);
  }, [flashEndsAt, flashStartedAt, pkg, snapshot.phase, snapshot.serverNow]);

  const now = Date.now() + skewRef.current;
  const count = pkg ? countdownDigit(pkg, now) : null;
  const showing =
    (snapshot.phase === "flash" ||
      (snapshot.phase === "countdown" && count == null && flashStartedAt != null && now >= flashStartedAt)) &&
    (flashEndsAt == null || now < flashEndsAt) &&
    mineSlots.some((s) => s.value != null);

  // flash 中は host がまだ value を配っていない瞬間があるので、phase=flash なら表示枠を出す
  const flashVisible =
    showing ||
    (snapshot.phase === "flash" &&
      (flashEndsAt == null || now < flashEndsAt) &&
      mineSlots.length > 0);

  const tap = (half: "left" | "right" | null) => {
    if (snapshot.phase !== "answer") return;
    const at = Date.now();
    if (at - lock.current < 180) return;
    lock.current = at;
    send({ type: "tap", deviceId, half });
  };

  if (snapshot.phase === "idle") {
    return (
      <div className="peri-center">
        <span className="peri-wait">
          <span className="peri-wait-no">No.{mine?.place ?? ""}</span>
          <span className="peri-wait-clock">{clock}</span>
        </span>
      </div>
    );
  }

  if (snapshot.phase === "ready" || snapshot.phase === "result") {
    return <div className="peri-center" />;
  }

  if (snapshot.phase === "countdown" && (count != null || !flashVisible)) {
    return <div className="peri-center" />;
  }

  if (snapshot.phase === "review") {
    return split ? (
      <div className="flash-split">
        {mineSlots.map((slot) => (
          <div key={slot.half ?? "only"} className="flash-half">
            <Digit slot={slot} colored />
          </div>
        ))}
      </div>
    ) : (
      <div className="peri-center">{mineSlots[0] ? <Digit slot={mineSlots[0]} colored /> : null}</div>
    );
  }

  if (snapshot.phase === "answer") {
    return split ? (
      <div className="flash-split">
        <button type="button" className="flash-half" onPointerDown={() => tap("left")} />
        <button type="button" className="flash-half" onPointerDown={() => tap("right")} />
      </div>
    ) : (
      <button type="button" className="peri-pad" onPointerDown={() => tap(null)} />
    );
  }

  if (flashVisible) {
    // countdown→flash 直後は slots に value が載る。無ければ空枠。
    return split ? (
      <div className="flash-split">
        {mineSlots.map((slot) => (
          <div key={slot.half ?? "only"} className="flash-half">
            <Digit slot={slot} colored={false} />
          </div>
        ))}
      </div>
    ) : (
      <div className="peri-center">{mineSlots[0] ? <Digit slot={mineSlots[0]} colored={false} /> : null}</div>
    );
  }

  return <div className="peri-center" />;
}
