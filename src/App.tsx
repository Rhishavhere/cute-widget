import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import herPhoto from "./assets/her.jpeg";

const HOUR_MS = 60 * 60 * 1000;
const SNOOZE_MS = 15 * 60 * 1000;
const STORAGE_KEY = "call-her-widget";
const FULL_SIZE = { width: 456, height: 192 };
const MINI_SIZE = { width: 92, height: 92 };

type Saved = {
  opacity: number;
  pinned: boolean;
  lastCheckIn: number;
  lastNotifiedAt: number;
  snoozedUntil: number;
};

const defaults = (): Saved => ({
  opacity: 0.82,
  pinned: true,
  lastCheckIn: Date.now(),
  lastNotifiedAt: 0,
  snoozedUntil: 0,
});

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    // A bad saved preference should never stop the widget opening.
  }
  return defaults();
}

function formatRemaining(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

async function ensureNotifyPermission() {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    return granted;
  } catch {
    return false;
  }
}

export default function App() {
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [now, setNow] = useState(Date.now);
  const [collapsed, setCollapsed] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const nextDueAt = Math.max(saved.lastCheckIn + HOUR_MS, saved.snoozedUntil);
  const remaining = nextDueAt - now;
  const overdue = remaining <= 0;
  const snoozing = saved.snoozedUntil > now && saved.snoozedUntil > saved.lastCheckIn + HOUR_MS;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [saved]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    getCurrentWindow().setAlwaysOnTop(saved.pinned).catch(() => undefined);
  }, [saved.pinned]);

  useEffect(() => {
    if (!overdue || now - saved.lastNotifiedAt < HOUR_MS) return;
    let cancelled = false;
    void (async () => {
      if (!(await ensureNotifyPermission()) || cancelled) return;
      await sendNotification({
        title: "CALL HER. TEXT HER!",
        body: "She's gonna CRY!!! A tiny check-in still counts. ♡",
      });
      if (!cancelled) setSaved((current) => ({ ...current, lastNotifiedAt: Date.now() }));
    })();
    return () => { cancelled = true; };
  }, [now, overdue, saved.lastNotifiedAt]);

  const resize = useCallback(async (mini: boolean) => {
    const size = mini ? MINI_SIZE : FULL_SIZE;
    await getCurrentWindow().setSize(new LogicalSize(size.width, size.height));
  }, []);

  const toggleCollapsed = useCallback(async () => {
    const next = !collapsed;
    setCollapsed(next);
    await resize(next);
  }, [collapsed, resize]);

  const checkIn = useCallback(() => {
    const timestamp = Date.now();
    setSaved((current) => ({
      ...current,
      lastCheckIn: timestamp,
      lastNotifiedAt: timestamp,
      snoozedUntil: 0,
    }));
    setNow(timestamp);
    setCelebrating(true);
    window.setTimeout(() => setCelebrating(false), 1800);
  }, []);

  const snooze = useCallback(() => {
    const until = Date.now() + SNOOZE_MS;
    setSaved((current) => ({ ...current, snoozedUntil: until }));
    setNow(Date.now());
  }, []);

  const status = useMemo(() => {
    if (celebrating) return "sweet. you made time for her ♡";
    if (overdue) return "a little love is due";
    if (snoozing) return `gentle nudge in ${formatRemaining(remaining)}`;
    return `next little nudge in ${formatRemaining(remaining)}`;
  }, [celebrating, overdue, remaining, snoozing]);

  if (collapsed) {
    return (
      <button className={`orb ${overdue ? "orb-alert" : ""}`} style={{ ["--glass" as string]: String(saved.opacity) }} onClick={toggleCollapsed} title="Open Call Her" data-tauri-drag-region>
        <img src={herPhoto} alt="" className="orb-photo" />
        <span className="orb-heart">♡</span>
      </button>
    );
  }

  return (
    <main className={`widget ${overdue ? "is-overdue" : ""} ${celebrating ? "is-celebrating" : ""}`} style={{ ["--glass" as string]: String(saved.opacity) }} data-tauri-drag-region>
      <div className="photo-wrap" data-tauri-drag-region>
        <img src={herPhoto} alt="A favorite photo of her" className="photo" />
        <span className="photo-ring" />
        <span className="photo-note">my favorite person</span>
      </div>

      <section className="copy" data-tauri-drag-region>
        <p className="kicker"><span>♥</span> love reminder</p>
        <h1>CALL HER.<br />TEXT HER!</h1>
        <p className="cry">She&apos;s gonna <em>CRY!!!</em></p>
        <p className={`status ${overdue ? "warn" : ""}`}>{status}</p>
      </section>

      <nav className="chrome" aria-label="Widget controls">
        <button className={`icon-btn ${saved.pinned ? "on" : ""}`} title={saved.pinned ? "Unpin from top" : "Keep over other windows"} onClick={() => setSaved((current) => ({ ...current, pinned: !current.pinned }))}>{saved.pinned ? "⌖" : "⊙"}</button>
        <button className="icon-btn" title="Minimize to photo" onClick={toggleCollapsed}>−</button>
        <button className="icon-btn close" title="Close widget" onClick={() => getCurrentWindow().close()}>×</button>
      </nav>

      <footer className="footer">
        <button className="checkin" onClick={checkIn}>I checked in ♡</button>
        <button className="snooze" onClick={snooze} disabled={!overdue} title={overdue ? "Remind me again in 15 minutes" : "Available when a reminder is due"}>not now · 15m</button>
        <label className="opacity" title="Adjust widget transparency">
          <span>glass</span>
          <input type="range" min={0.28} max={0.94} step={0.02} value={saved.opacity} onChange={(event) => setSaved((current) => ({ ...current, opacity: Number(event.target.value) }))} />
        </label>
      </footer>
    </main>
  );
}
