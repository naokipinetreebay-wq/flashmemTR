"use client";

import { useEffect, useRef, useState } from "react";
import { placementsFor } from "@/lib/placement";
import type { ClientMessage, RoomSnapshot, SlotView } from "@/lib/types";

function tone(slot: SlotView) {
  if (slot.correct === true) return "cue-green";
  if (slot.correct === false) return "cue-red";
  return "";
}

function Digit({ slot, colored }: { slot: SlotView; colored: boolean }) {
  const compact = typeof slot.value === "number" && slot.value >= 10;
  return (
    <span className={`peri-digit ${compact ? "compact" : ""} ${colored ? tone(slot) : ""}`}>{slot.value ?? ""}</span>
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

  useEffect(() => {
    if (snapshot.phase !== "flash" || snapshot.flashEndsAt == null) return;
    const delay = snapshot.flashEndsAt - (Date.now() + skewRef.current);
    const id = setTimeout(() => setClock((n) => n + 1), Math.max(0, delay));
    return () => clearTimeout(id);
  }, [snapshot.flashEndsAt, snapshot.phase, snapshot.serverNow]);

  const now = Date.now() + skewRef.current;
  const showing =
    snapshot.phase === "flash" && (snapshot.flashEndsAt == null || now < snapshot.flashEndsAt);

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

  if (showing) {
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
