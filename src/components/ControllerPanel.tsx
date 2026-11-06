"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo } from "react";
import { SessionExit } from "@/components/SessionExit";
import { placementsFor } from "@/lib/placement";
import {
  MAX_FLASH,
  MIN_FLASH,
  type ClientMessage,
  type Level,
  type RoomConfig,
  type RoomSnapshot,
} from "@/lib/types";

export function ControllerPanel({
  snapshot,
  connected,
  send,
  clearSessionKeys,
  onShowCenter,
}: {
  snapshot: RoomSnapshot;
  connected: boolean;
  send: (msg: ClientMessage) => void;
  clearSessionKeys?: string[];
  onShowCenter: () => void;
}) {
  const cfg = snapshot.config;
  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/d/${snapshot.code}`;
  }, [snapshot.code]);
  const slots = placementsFor(snapshot.displays.length);
  const placeByNo = new Map(slots.map((slot) => [slot.no, slot.clock]));
  const online = snapshot.displays.filter((d) => d.connected).length;
  const canStart = connected && online >= 2 && snapshot.displays.length <= 6 && !cfg.running;
  const status =
    snapshot.phase === "flash"
      ? "表示中"
      : snapshot.phase === "answer"
        ? "答え"
        : snapshot.phase === "review"
          ? "答え合わせ"
          : "待機";

  const patch = (partial: Partial<RoomConfig>) => {
    if (cfg.running) return;
    send({ type: "updateConfig", config: partial });
  };

  return (
    <div className="controller">
      <header className="controller-header">
        <div>
          <p className="eyebrow">FlashMem</p>
          <h1>ルーム {snapshot.code}</h1>
        </div>
        <div className={`pill ${connected ? "ok" : "bad"}`}>{connected ? "接続中" : "再接続中…"}</div>
      </header>

      <section className="panel">
        <h2>正答</h2>
        <p className="time-read">
          {snapshot.correct}
          <span className="score-denom">/{snapshot.questionTotal || "–"}</span>
        </p>
        <p className="muted">
          {status}
          {snapshot.phase === "answer"
            ? ` · ${Math.min(snapshot.questionTotal, snapshot.asked + 1)}/${snapshot.questionTotal}`
            : ""}
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            disabled={!canStart}
            onClick={() => {
              send({ type: "start" });
              onShowCenter();
            }}
          >
            {snapshot.phase === "review" ? "もう一度" : "開始"}
          </button>
          <button type="button" className="btn danger" onClick={() => send({ type: "stop" })}>
            停止
          </button>
        </div>
        {snapshot.phase !== "idle" ? (
          <button type="button" className="btn ghost" onClick={onShowCenter}>
            真ん中の画面
          </button>
        ) : null}
      </section>

      <section className="panel">
        <h2>問題</h2>
        <label className="field">
          <span>レベル</span>
          <select
            value={cfg.level}
            disabled={cfg.running}
            onChange={(e) => patch({ level: e.target.value as Level })}
          >
            <option value="easy">簡単（連番）</option>
            <option value="hard">難しい（2桁を含むランダム）</option>
          </select>
        </label>
        <label className="field">
          <span>表示: {cfg.flashSeconds.toFixed(1)}秒</span>
          <input
            type="range"
            min={MIN_FLASH}
            max={MAX_FLASH}
            step={0.1}
            value={cfg.flashSeconds}
            disabled={cfg.running}
            onChange={(e) => patch({ flashSeconds: Number(e.target.value) })}
          />
        </label>
        <label className="field check">
          <input
            type="checkbox"
            checked={cfg.centerNumber}
            disabled={cfg.running}
            onChange={(e) => patch({ centerNumber: e.target.checked })}
          />
          <span>コントローラーにも数字を出す</span>
        </label>
        <label className="field check">
          <input
            type="checkbox"
            checked={cfg.split}
            disabled={cfg.running}
            onChange={(e) => patch({ split: e.target.checked })}
          />
          <span>左右2分割（1台に2つ）</span>
        </label>
        <p className="muted">
          {!connected || online < 2
            ? "コントローラを含めて3台つながるまで開始できません。"
            : "数字は重複しません。結果は正答 x/x です。"}
        </p>
      </section>

      <section className="panel">
        <h2>周囲の端末</h2>
        <p className="muted">周囲 {snapshot.displays.length} 台</p>
        <div className="qr-wrap">{displayUrl ? <QRCodeSVG value={displayUrl} size={160} /> : null}</div>
        <p className="mono url">{displayUrl}</p>
        {snapshot.displays.length === 0 ? (
          <p className="muted">まだ端末がありません。QRを読み取ってください。</p>
        ) : (
          <ul className="device-list">
            {snapshot.displays.map((d) => (
              <li key={d.id}>
                <span className="place-badge">{d.place}</span>
                <input
                  className="label-input"
                  value={d.label}
                  onChange={(e) => send({ type: "setLabel", deviceId: d.id, label: e.target.value })}
                />
                <span className="clock-label">{placeByNo.get(d.place) ?? ""}</span>
                <span className={`dot ${d.connected ? "ok" : "bad"}`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <SessionExit onStop={() => send({ type: "stop" })} clearSessionKeys={clearSessionKeys} />
    </div>
  );
}
