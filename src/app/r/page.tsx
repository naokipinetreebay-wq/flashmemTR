"use client";

import { useEffect, useRef, useState } from "react";
import { CenterScreen } from "@/components/CenterScreen";
import { ControllerPanel } from "@/components/ControllerPanel";
import { SetupWizard } from "@/components/SetupWizard";
import { useFlashMemLocalHost } from "@/lib/localHost";
import { useRoomCode } from "@/lib/roomCode";
import { useDeviceId, useRoomSocket } from "@/lib/ws";

export default function ControllerPage() {
  const code = useRoomCode();
  const deviceId = useDeviceId(`controller-${code}`);
  const { snapshot, error, connected, send, clientEvent } = useRoomSocket(
    code,
    "controller",
    deviceId
  );
  const {
    startLocal,
    stopLocal,
    beginAnswer,
    openReview,
    reviewStep,
    tapLocal,
  } = useFlashMemLocalHost(snapshot, send, clientEvent);

  const wizardKey = `fm-wizard-done-${code}`;
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<"control" | "center">("control");
  const pendingStart = useRef(false);

  useEffect(() => {
    setReady(sessionStorage.getItem(wizardKey) === "1");
    setHydrated(true);
  }, [wizardKey]);

  useEffect(() => {
    if (!pendingStart.current || !ready || !snapshot) return;
    const online = snapshot.displays.filter((d) => d.connected).length;
    if (!connected || online < 2) return;
    pendingStart.current = false;
    startLocal();
  }, [connected, ready, snapshot, startLocal]);

  if (error && !snapshot) {
    return (
      <main className="error-page">
        <div>
          <h1>接続できません</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!snapshot || !hydrated) {
    return (
      <main className="error-page">
        <p>ルームに接続中…</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <SetupWizard
        snapshot={snapshot}
        connected={connected}
        send={send}
        onDone={() => {
          sessionStorage.setItem(wizardKey, "1");
          pendingStart.current = true;
          setReady(true);
          setView("center");
        }}
      />
    );
  }

  const showCenter = view === "center" && snapshot.phase !== "idle";

  if (showCenter) {
    return (
      <div className="ctrl-display-shell">
        <CenterScreen
          snapshot={snapshot}
          send={send}
          onBeginAnswer={beginAnswer}
          onOpenReview={openReview}
          onReviewStep={reviewStep}
          onTap={tapLocal}
        />
        <button type="button" className="ctrl-return-bar" onClick={() => setView("control")}>
          コントローラに戻る
        </button>
      </div>
    );
  }

  return (
    <>
      <ControllerPanel
        snapshot={snapshot}
        connected={connected}
        send={send}
        clearSessionKeys={[wizardKey]}
        onShowCenter={() => setView("center")}
        onStart={() => {
          startLocal();
          setView("center");
        }}
        onStop={stopLocal}
        onBeginAnswer={beginAnswer}
        onOpenReview={openReview}
        onReviewStep={reviewStep}
      />
      <div className="controller" style={{ paddingTop: 0, gap: 10 }}>
        <button
          type="button"
          className="btn linkish"
          onClick={() => {
            sessionStorage.removeItem(wizardKey);
            setReady(false);
            setView("control");
          }}
        >
          セットアップウィザードをやり直す
        </button>
      </div>
    </>
  );
}
