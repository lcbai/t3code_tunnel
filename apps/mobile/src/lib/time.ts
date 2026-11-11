export function relativeTime(input: string, nowMs: number = Date.now()): string {
  const timestamp = Date.parse(input);
  if (Number.isNaN(timestamp)) {
    return "不到 1 分钟";
  }

  const deltaSeconds = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (deltaSeconds < 60) return "不到 1 分钟";

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes} 分钟`;

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours} 小时`;

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays} 天`;
}

/** Milliseconds until the relative-time label next changes. */
export function msUntilRelativeTimeChange(
  input: string,
  nowMs: number = Date.now(),
): number | null {
  const timestamp = Date.parse(input);
  if (Number.isNaN(timestamp)) return null;
  const elapsedMs = Math.max(0, nowMs - timestamp);
  const unitMs = elapsedMs < 3_600_000 ? 60_000 : elapsedMs < 86_400_000 ? 3_600_000 : 86_400_000;
  const nextChangeMs = timestamp + (Math.floor(elapsedMs / unitMs) + 1) * unitMs;
  // Far-future timestamps must not overflow setTimeout's signed 32-bit delay.
  return Math.min(nextChangeMs - nowMs, 86_400_000);
}
