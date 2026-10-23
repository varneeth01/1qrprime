type Recurrence = { frequency?: "daily" | "weekly"; daysOfWeek?: number[]; startTime?: string; endTime?: string; timezone?: string };

function minutes(value: string | undefined) {
  const match = value?.match(/^(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : undefined;
}

/** Evaluates the persisted recurrence without changing the promotion's UTC audit window. */
export function isPromotionActive(promotion: { start_at: string; end_at: string; recurrence_json?: unknown }, at = new Date()) {
  const start = new Date(promotion.start_at).getTime();
  const end = new Date(promotion.end_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || at.getTime() < start || at.getTime() >= end) return false;
  if (!promotion.recurrence_json) return true;
  let recurrence: Recurrence;
  try { recurrence = typeof promotion.recurrence_json === "string" ? JSON.parse(promotion.recurrence_json) : promotion.recurrence_json as Recurrence; } catch { return false; }
  if (!recurrence || !recurrence.frequency) return true;
  const timezone = recurrence.timezone || "UTC";
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  } catch { return false; }
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  if (recurrence.frequency === "weekly" && recurrence.daysOfWeek?.length && !recurrence.daysOfWeek.includes(weekday)) return false;
  const current = Number(parts.hour) * 60 + Number(parts.minute);
  const startTime = minutes(recurrence.startTime);
  const endTime = minutes(recurrence.endTime);
  if (startTime === undefined || endTime === undefined) return true;
  return startTime <= endTime ? current >= startTime && current < endTime : current >= startTime || current < endTime;
}
