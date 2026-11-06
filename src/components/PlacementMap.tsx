"use client";

import { placementsFor } from "@/lib/placement";

export function PlacementMap({ count }: { count: number }) {
  const shown = count >= 2 ? count : 2;
  const slots = placementsFor(shown);

  return (
    <div className="placement">
      <div className="placement-ring" aria-hidden="true">
        <span className="placement-center">中</span>
        {slots.map((slot) => {
          const rad = (slot.angle * Math.PI) / 180;
          const left = 50 + Math.sin(rad) * 38;
          const top = 50 - Math.cos(rad) * 38;
          const filled = slot.no <= count;
          return (
            <span
              key={slot.no}
              className={`placement-dot ${filled ? "filled" : ""}`}
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              {slot.no}
            </span>
          );
        })}
      </div>
      <p className="muted placement-note">
        {count < 2
          ? "2台そろうと、9時と3時に置きます。"
          : "台数が変わると置き場所も変わります。そろってから置いてください。"}
      </p>
    </div>
  );
}
