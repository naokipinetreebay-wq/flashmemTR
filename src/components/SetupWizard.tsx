"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { PlacementMap } from "@/components/PlacementMap";
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

const STEPS = ["説明", "設定", "配置", "確認"] as const;

export function SetupWizard({
  snapshot,
  connected,
  send,
  onDone,
}: {
  snapshot: RoomSnapshot;
  connected: boolean;
  send: (msg: ClientMessage) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const cfg = snapshot.config;
  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/d/?code=${snapshot.code}`;
  }, [snapshot.code]);
  const joined = snapshot.displays.length;
  const online = snapshot.displays.filter((d) => d.connected).length;
  const roster = online + (connected ? 1 : 0);
  const slots = placementsFor(joined);
  const placeByNo = new Map(slots.map((slot) => [slot.no, slot.clock]));

  const patch = (partial: Partial<RoomConfig>) => {
    send({ type: "updateConfig", config: partial });
  };

  return (
    <div className="wizard">
      <header className="wizard-top">
        <div>
          <p className="eyebrow">FlashMem · セットアップ</p>
          <h1>ルーム {snapshot.code}</h1>
        </div>
        <div className="wizard-top-actions">
          <SessionExit compact />
          <div className={`pill ${connected ? "ok" : "bad"}`}>{connected ? "接続中" : "再接続中…"}</div>
        </div>
      </header>

      <ol className="wizard-steps" aria-label="手順">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "active" : i < step ? "done" : ""}>
            <span className="n">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <section className="panel wizard-panel">
        {step === 0 ? (
          <div className="wizard-body">
            <h2>瞬間視</h2>
            <ul className="explain-list">
              <li>全部の端末に、設定した時間だけ数字が同時に出ます。</li>
              <li>どこに何が出たかを覚えます。</li>
              <li>そのあと、真ん中が数字を1つずつ出します。出ていた端末をタップします。</li>
              <li>数字が真ん中にあったときは、真ん中の端末をタップします。</li>
              <li>全部答え終わると、当たった数字は緑、外れた数字は赤で出ます。</li>
              <li>結果は正答 x/x です。x は出た数字の数です。</li>
              <li>簡単は 1 からの連番です。難しいは 2 桁を含むランダムな数です。</li>
              <li>左右2分割にすると、1台に数字が2つ出ます。出ていた側をタップします。</li>
            </ul>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="wizard-body">
            <h2>問題</h2>
            <label className="field">
              <span>レベル</span>
              <select value={cfg.level} onChange={(e) => patch({ level: e.target.value as Level })}>
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
                onChange={(e) => patch({ flashSeconds: Number(e.target.value) })}
              />
            </label>
            <label className="field check">
              <input
                type="checkbox"
                checked={cfg.centerNumber}
                onChange={(e) => patch({ centerNumber: e.target.checked })}
              />
              <span>コントローラーにも数字を出す</span>
            </label>
            <label className="field check">
              <input type="checkbox" checked={cfg.split} onChange={(e) => patch({ split: e.target.checked })} />
              <span>左右2分割（1台に2つ）</span>
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-body">
            <h2>周囲の端末を置く</h2>
            <p className="join-meter">接続中 {roster} 台（コントローラを含む）。3台そろうまで開始できません。</p>
            <PlacementMap count={joined} />
            <div className="qr-wrap">{displayUrl ? <QRCodeSVG value={displayUrl} size={180} /> : null}</div>
            <p className="mono url">{displayUrl}</p>
            {joined > 0 ? (
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
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="wizard-body">
            <h2>準備完了</h2>
            <ul className="summary-list">
              <li>この端末を真ん中に置く</li>
              <li>接続中 {roster} 台（コントローラを含む）</li>
              <li>{cfg.level === "hard" ? "難しい" : "簡単"}、表示 {cfg.flashSeconds.toFixed(1)}秒</li>
              <li>
                {cfg.centerNumber ? "コントローラーも出題" : "コントローラーは出題しない"}
                {cfg.split ? "、左右2分割" : ""}
              </li>
            </ul>
            <p className="muted">「はじめる」で数字が一瞬出ます。</p>
          </div>
        ) : null}
      </section>

      <footer className="wizard-nav">
        <button type="button" className="btn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          戻る
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn primary"
            disabled={step === 2 && (roster < 3 || joined > 6)}
            onClick={() => setStep((s) => s + 1)}
          >
            {step === 2 && roster < 3 ? "3台そろうまで進めません" : "次へ"}
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={roster < 3} onClick={onDone}>
            {roster < 3 ? "3台そろうまで開始できません" : "はじめる"}
          </button>
        )}
      </footer>
      <SessionExit onStop={() => send({ type: "stop" })} />
    </div>
  );
}
