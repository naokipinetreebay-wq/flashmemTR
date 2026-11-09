"use client";

import { DisplayScreen } from "@/components/DisplayScreen";
import { useRoomCode } from "@/lib/roomCode";
import { useDeviceId, useRoomSocket } from "@/lib/ws";

export default function DisplayPage() {
  const code = useRoomCode();
  const deviceId = useDeviceId(`display-${code}`);
  const { snapshot, error, connected, sendGame } = useRoomSocket(code, "display", deviceId);

  if (error && !snapshot) {
    return (
      <main className="error-page">
        <div>
          <h1>参加できません</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!snapshot || !deviceId) {
    return (
      <main className="error-page">
        <p>接続中…</p>
      </main>
    );
  }

  return (
    <>
      <DisplayScreen snapshot={snapshot} deviceId={deviceId} sendGame={sendGame} />
      {!connected ? <div className="status-bar">再接続中…</div> : null}
    </>
  );
}
