export interface Placement {
  no: number;
  /** 12時を0度として時計回り */
  angle: number;
  clock: string;
}

const FIXED: Record<number, { angle: number; clock: string }[]> = {
  2: [
    { angle: 270, clock: "9時" },
    { angle: 90, clock: "3時" },
  ],
  3: [
    { angle: 300, clock: "10時" },
    { angle: 60, clock: "2時" },
    { angle: 180, clock: "6時" },
  ],
  4: [
    { angle: 300, clock: "10時" },
    { angle: 240, clock: "8時" },
    { angle: 120, clock: "4時" },
    { angle: 60, clock: "2時" },
  ],
};

function clockFace(ccwDegrees: number): string {
  const hour = 12 - ccwDegrees / 30;
  const normalized = ((hour % 12) + 12) % 12;
  const shown = normalized === 0 ? 12 : normalized;
  const nearest = Math.round(shown * 10) / 10;
  if (Math.abs(nearest - Math.round(nearest)) < 0.05) {
    const whole = Math.round(nearest);
    return `${whole === 0 ? 12 : whole}時`;
  }
  const low = Math.floor(shown);
  const high = low + 1;
  const a = low === 0 ? 12 : low;
  const b = high >= 12 ? high - 12 || 12 : high;
  return `${a}時と${b}時のあいだ`;
}

function polygon(count: number): { angle: number; clock: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const ccw = (360 / count) * i;
    return { angle: (360 - ccw) % 360, clock: clockFace(ccw) };
  });
}

/** 周囲の台数に対する置き場所。コントローラは真ん中で、ここには含めない。 */
export function placementsFor(count: number): Placement[] {
  const n = Math.max(0, Math.min(6, count));
  if (n === 0) return [];
  const raw = FIXED[n] ?? polygon(n);
  return raw.slice(0, n).map((slot, i) => ({ no: i + 1, ...slot }));
}
