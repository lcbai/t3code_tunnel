const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatScheduledTaskInterval(everyMs: number): string {
  const units = [
    [7 * DAY, "周"],
    [DAY, "天"],
    [HOUR, "小时"],
    [MINUTE, "分钟"],
    [1_000, "秒"],
    [1, "毫秒"],
  ] as const;
  let remaining = everyMs;
  const parts: string[] = [];
  for (const [size, unit] of units) {
    const count = Math.floor(remaining / size);
    if (count === 0) continue;
    parts.push(`${count} ${unit}`);
    remaining %= size;
  }
  return `每 ${parts.join(" ")}运行一次`;
}

function localCalendarDay(date: Date): number {
  // Compare calendar days, not 24-hour spans: DST days can have 23 or 25 hours.
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY;
}

export function formatNextScheduledTaskRun(nextRunAt: string, now: number): string {
  const next = new Date(nextRunAt);
  const current = new Date(now);
  const remaining = next.getTime() - now;
  if (!Number.isFinite(remaining)) return "下次运行时间未知";
  if (remaining <= 0) return "已到下次运行时间";

  const days = localCalendarDay(next) - localCalendarDay(current);
  if (days === 0) {
    if (remaining < MINUTE) return "将在 1 分钟内运行";
    const unit = remaining < HOUR ? "分钟" : "小时";
    const count = Math.round(remaining / (remaining < HOUR ? MINUTE : HOUR));
    return `将在 ${count} ${unit}后运行`;
  }

  const time = next.toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return `下次运行：明天 ${time}`;
  if (days <= 7) {
    return `下次运行：${next.toLocaleDateString("zh-CN", { weekday: "long" })} ${time}`;
  }
  const date = next.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    ...(next.getFullYear() !== current.getFullYear() ? { year: "numeric" as const } : {}),
  });
  return `下次运行：${date} ${time}`;
}
