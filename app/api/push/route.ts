import { ensureSchema, getD1 } from "@/db";
import { vapidPublicKey } from "@/lib/web-push";
import { MAX_LINK_LENGTH, OWNER_ID, failure, json, readJsonBody, text } from "@/app/api/shared";

const MAX_KEY_LENGTH = 256;
const MINUTES_PER_DAY = 24 * 60;

type SubscriptionRow = { notify_minute: number };

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > MAX_LINK_LENGTH) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validMinute(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < MINUTES_PER_DAY;
}

// `endpoint` identifies the device asking. Without it the response only
// carries the public key the browser needs to subscribe.
export async function GET(request: Request) {
  try {
    const endpoint = new URL(request.url).searchParams.get("endpoint");
    let notifyMinute: number | null = null;
    if (endpoint) {
      await ensureSchema();
      const row = await getD1()
        .prepare("SELECT notify_minute FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
        .bind(endpoint, OWNER_ID)
        .first<SubscriptionRow>();
      notifyMinute = row?.notify_minute ?? null;
    }
    return json({ publicKey: vapidPublicKey(), notifyMinute });
  } catch (error) {
    return failure("Push", error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await readJsonBody(request);
    if (!payload) return json({ error: "Send a valid JSON body." }, { status: 400 });
    const subscription = payload.subscription as Record<string, unknown> | undefined;
    const keys = subscription?.keys as Record<string, unknown> | undefined;
    const p256dh = text(keys?.p256dh);
    const auth = text(keys?.auth);
    if (
      !validEndpoint(subscription?.endpoint) ||
      !p256dh ||
      !auth ||
      p256dh.length > MAX_KEY_LENGTH ||
      auth.length > MAX_KEY_LENGTH
    ) {
      return json({ error: "Send a valid push subscription." }, { status: 400 });
    }
    if (!validTimeZone(payload.timeZone)) {
      return json({ error: "A valid time zone is required." }, { status: 400 });
    }
    if (!validMinute(payload.notifyMinute)) {
      return json({ error: "Choose a valid time." }, { status: 400 });
    }

    await ensureSchema();
    const timestamp = new Date().toISOString();
    const row = await getD1()
      .prepare(`INSERT INTO push_subscriptions (
          id, user_id, endpoint, p256dh, auth, time_zone, notify_minute, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          time_zone = excluded.time_zone,
          notify_minute = excluded.notify_minute,
          updated_at = excluded.updated_at
        RETURNING notify_minute`)
      .bind(
        crypto.randomUUID(),
        OWNER_ID,
        subscription.endpoint,
        p256dh,
        auth,
        payload.timeZone,
        payload.notifyMinute,
        timestamp,
        timestamp,
      )
      .first<SubscriptionRow>();
    if (!row) throw new Error("The subscription was not returned after saving.");
    return json({ notifyMinute: row.notify_minute }, { status: 201 });
  } catch (error) {
    return failure("Push", error);
  }
}

export async function DELETE(request: Request) {
  try {
    const endpoint = new URL(request.url).searchParams.get("endpoint")?.trim();
    if (!endpoint) return json({ error: "A subscription endpoint is required." }, { status: 400 });
    await ensureSchema();
    const result = await getD1()
      .prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
      .bind(endpoint, OWNER_ID)
      .run();
    if (!result.meta.changes) return json({ error: "Subscription not found." }, { status: 404 });
    return json({ deleted: true });
  } catch (error) {
    return failure("Push", error);
  }
}
