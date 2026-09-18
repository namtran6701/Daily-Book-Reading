import { OWNER_ID } from "../app/api/shared";
import { ensureSchema, getD1 } from "../db";
import { briefingNotification, summarizeThoughts } from "../lib/briefing";
import { sendPush } from "../lib/web-push";

// One cron interval wide, matching `triggers.crons` in wrangler.jsonc. A late
// firing still lands inside the window; the log stops a second send.
export const CRON_MINUTES = 15;
const LOG_RETENTION_DAYS = 90;
// Delivery waits this long for a phone that is off before the push service gives up.
const BRIEFING_TTL_SECONDS = 4 * 60 * 60;

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  time_zone: string;
  notify_minute: number;
};

type ThoughtRow = {
  id: string;
  body: string;
  quadrant: string;
  day_key: string;
  scheduled_day_key: string | null;
};

// The wall clock in one zone: calendar day plus minutes since midnight. The
// Worker itself runs in UTC, so every "is it time yet" decision goes through here.
export function localClock(now: Date, timeZone: string): { dayKey: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "00";
  return {
    dayKey: `${part("year")}-${part("month")}-${part("day")}`,
    minute: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

export async function runScheduledNotifications(now: Date): Promise<void> {
  await ensureSchema();
  const db = getD1();
  const subscriptions = await db
    .prepare(`SELECT id, endpoint, p256dh, auth, time_zone, notify_minute
      FROM push_subscriptions WHERE user_id = ?`)
    .bind(OWNER_ID)
    .all<SubscriptionRow>();

  let openThoughts: ThoughtRow[] | null = null;
  const loadOpenThoughts = async () =>
    (openThoughts ??= (
      await db
        .prepare(`SELECT id, body, quadrant, day_key, scheduled_day_key
          FROM thoughts WHERE user_id = ? AND status = 'open'`)
        .bind(OWNER_ID)
        .all<ThoughtRow>()
    ).results);

  for (const subscription of subscriptions.results) {
    const { dayKey, minute } = localClock(now, subscription.time_zone);
    const offset = minute - subscription.notify_minute;
    if (offset < 0 || offset >= CRON_MINUTES) continue;

    // Claim the day before sending, so an overlapping run cannot send twice.
    const claim = await db
      .prepare(`INSERT INTO notification_log (subscription_id, kind, local_day_key, sent_at)
        VALUES (?, 'briefing', ?, ?) ON CONFLICT DO NOTHING`)
      .bind(subscription.id, dayKey, now.toISOString())
      .run();
    if (!claim.meta.changes) continue;

    const thoughts = (await loadOpenThoughts()).map((row) => ({
      id: row.id,
      body: row.body,
      quadrant: row.quadrant,
      done: false,
      capturedDayKey: row.day_key,
      scheduledDayKey: row.scheduled_day_key,
    }));
    const message = briefingNotification(
      summarizeThoughts(thoughts, dayKey),
      Math.floor(subscription.notify_minute / 60),
    );
    if (!message) continue;

    const outcome = await sendPush(subscription, { ...message, tag: "briefing", url: "/" }, BRIEFING_TTL_SECONDS);
    if (outcome === "gone") {
      await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(subscription.id).run();
    } else if (outcome === "failed") {
      // Release the claim so the next run inside the window can try again.
      await db
        .prepare("DELETE FROM notification_log WHERE subscription_id = ? AND kind = 'briefing' AND local_day_key = ?")
        .bind(subscription.id, dayKey)
        .run();
    }
  }

  const cutoff = new Date(now.getTime() - LOG_RETENTION_DAYS * 86_400_000).toISOString();
  await db.prepare("DELETE FROM notification_log WHERE sent_at < ?").bind(cutoff).run();
}
