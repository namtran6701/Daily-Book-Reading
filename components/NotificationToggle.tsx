"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Overlay } from "./Overlay";
import { BellIcon, SpinnerIcon } from "./icons";
import { snappy } from "@/lib/springs";

// 7:30 local, as minutes after midnight. Mirrors the column default.
const DEFAULT_MINUTE = 7 * 60 + 30;
const SAVE_DELAY_MS = 600;

// "install" is iOS Safari in a browser tab, where push only exists once the
// app is on the Home Screen. "none" hides the bell entirely.
type Support = "unknown" | "ready" | "install" | "none";

type Props = { readOnly?: boolean };

function detectSupport(): Support {
  if (!("serviceWorker" in navigator)) return "none";
  if ("PushManager" in window && "Notification" in window) return "ready";
  return "standalone" in navigator ? "install" : "none";
}

function toTimeValue(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function fromTimeValue(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function timeLabel(minute: number): string {
  const date = new Date();
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
}

async function saveSubscription(subscription: PushSubscription, notifyMinute: number): Promise<void> {
  const response = await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      notifyMinute,
    }),
  });
  if (!response.ok) throw new Error("Could not save the notification.");
}

export function NotificationToggle({ readOnly = false }: Props) {
  const [support, setSupport] = useState<Support>("unknown");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [minute, setMinute] = useState(DEFAULT_MINUTE);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read the device's state once the service worker is ready: whether this
  // browser already holds a subscription and whether the server still has it.
  useEffect(() => {
    const detected = detectSupport();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(detected);
    if (detected !== "ready") return;
    setPermission(Notification.permission);
    let cancelled = false;
    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        const query = subscription ? `?endpoint=${encodeURIComponent(subscription.endpoint)}` : "";
        const response = await fetch(`/api/push${query}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load notification settings.");
        const data = (await response.json()) as { publicKey: string | null; notifyMinute: number | null };
        if (cancelled) return;
        setPublicKey(data.publicKey);
        if (subscription && data.notifyMinute !== null) {
          setSubscribed(true);
          setMinute(data.notifyMinute);
        }
      } catch {
        // The bell still renders; turning on will surface a real error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Permission can change in system settings while the app is backgrounded.
  useEffect(() => {
    if (support !== "ready") return;
    const refresh = () => setPermission(Notification.permission);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [support]);

  const turnOn = useCallback(async () => {
    if (!publicKey) {
      setMessage("Notifications aren’t set up on the server yet.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey }));
      await saveSubscription(subscription, minute);
      setSubscribed(true);
    } catch {
      setMessage("Couldn’t turn on notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }, [minute, publicKey]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch(`/api/push?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
          method: "DELETE",
          cache: "no-store",
        });
        // 404 means the server already forgot this device, which is the goal.
        if (!response.ok && response.status !== 404) throw new Error("Could not turn off notifications.");
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setMessage("Couldn’t turn off notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  // A time change on an active device re-saves after typing settles.
  const changeTime = useCallback(
    (value: string) => {
      const next = fromTimeValue(value);
      if (next === null) return;
      setMinute(next);
      if (!subscribed) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) await saveSubscription(subscription, next);
          setMessage(null);
        } catch {
          setMessage("Couldn’t save the new time. Try again.");
        }
      }, SAVE_DELAY_MS);
    },
    [subscribed],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  if (support === "unknown" || support === "none") return null;

  const blocked = permission === "denied";
  const status = subscribed
    ? `On. Arrives at ${timeLabel(minute)} on this device.`
    : "One notification a day with what’s open and what’s urgent.";

  return (
    <>
      <button
        className={`theme-toggle bell-toggle pressable ${subscribed ? "is-on" : ""}`}
        type="button"
        onClick={() => setOpen(true)}
        disabled={readOnly}
        aria-label={subscribed ? "Notifications on. Change settings" : "Notifications off. Turn on"}
        title={subscribed ? `Briefing at ${timeLabel(minute)}` : "Notifications"}
      >
        <BellIcon size={15} />
      </button>
      <AnimatePresence>
        {open && (
          <Overlay center label="Notifications" onClose={() => setOpen(false)}>
            <motion.div
              className="card menu"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={snappy}
            >
              <h2>Morning briefing</h2>
              {support === "install" ? (
                <p className="menu-copy">
                  Add Second Brain to your Home Screen from Safari’s Share menu, then turn on
                  notifications from there.
                </p>
              ) : blocked ? (
                <p className="menu-copy">
                  Notifications are blocked for Second Brain. Allow them in your device settings, then
                  come back.
                </p>
              ) : (
                <>
                  <p className="menu-sub menu-sub-wrap">{status}</p>
                  <div className="menu-list">
                    <label className="menu-field">
                      <span>Send at</span>
                      <input
                        type="time"
                        value={toTimeValue(minute)}
                        onChange={(event) => changeTime(event.target.value)}
                        disabled={busy || readOnly}
                      />
                    </label>
                    <button
                      className="menu-row"
                      type="button"
                      onClick={() => void (subscribed ? turnOff() : turnOn())}
                      disabled={busy || readOnly}
                    >
                      {busy ? <SpinnerIcon /> : <BellIcon />}
                      {subscribed ? "Turn off on this device" : "Turn on for this device"}
                    </button>
                  </div>
                  {message && <p className="menu-note">{message}</p>}
                </>
              )}
            </motion.div>
          </Overlay>
        )}
      </AnimatePresence>
    </>
  );
}
