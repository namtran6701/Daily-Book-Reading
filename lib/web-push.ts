import { env } from "cloudflare:workers";
import { buildPushPayload } from "@block65/webcrypto-web-push";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

// What the service worker's push handler reads.
export type PushContent = { title: string; body: string; tag: string; url: string };

export type PushOutcome = "sent" | "gone" | "failed";

export function vapidPublicKey(): string | null {
  return env.VAPID_PUBLIC_KEY || null;
}

// The push service (Apple, Google, Mozilla) answers 404 or 410 once a device
// has unsubscribed or been wiped; "gone" tells the caller to drop the row.
export async function sendPush(target: PushTarget, content: PushContent, ttlSeconds: number): Promise<PushOutcome> {
  try {
    const payload = await buildPushPayload(
      { data: content, options: { ttl: ttlSeconds } },
      { endpoint: target.endpoint, expirationTime: null, keys: { p256dh: target.p256dh, auth: target.auth } },
      { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
    );
    const response = await fetch(target.endpoint, payload);
    if (response.ok) return "sent";
    if (response.status === 404 || response.status === 410) return "gone";
    console.error("Push rejected", response.status, await response.text().catch(() => ""));
  } catch (error) {
    console.error("Push failed", error);
  }
  return "failed";
}
