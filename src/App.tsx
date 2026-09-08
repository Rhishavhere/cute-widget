import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import herPhoto from "./assets/her.jpeg";

const STORAGE_KEY = "call-her-widget";
const FULL_SIZE = { width: 456, height: 172 };
const MINI_SIZE = { width: 58, height: 58 };

type Saved = {
  opacity: number;
  dragUnlocked: boolean;
  lastCheckIn: number;
  lastNotificationHour: string;
};

function hourKey(date: Date) {
  return [date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()].join("-");
}

function nextHour(date: Date) {
  const next = new Date(date);
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next;
}

function hourLabel(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric" }).toLowerCase();
}

const defaults = (): Saved => ({
  opacity: 0.82,
  dragUnlocked: true,
  lastCheckIn: 0,
  // Opening the app midway through an hour must not create an unexpected notification.
  lastNotificationHour: hourKey(new Date()),
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
  const [now, setNow] = useState(() => new Date());
  const [collapsed, setCollapsed] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [testing, setTesting] = useState(false);

  const currentHour = hourKey(now);
  const nextReminder = useMemo(() => nextHour(now), [currentHour]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [saved]);

  useEffect(() => {
    let timer: number;
    const scheduleTick = () => {
      const current = new Date();
      timer = window.setTimeout(() => {
        setNow(new Date());
        scheduleTick();
      }, Math.max(100, nextHour(current).getTime() - current.getTime() + 100));
    };
    scheduleTick();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (currentHour === saved.lastNotificationHour) return;
    let cancelled = false;
    void (async () => {
      if (!(await ensureNotifyPermission()) || cancelled) return;
      await sendNotification({
        title: "CALL HER. TEXT HER!",
        body: "A tiny check-in still counts.",
      });
      if (!cancelled) {
        setSaved((current) => ({ ...current, lastNotificationHour: currentHour }));
      }
    })();
    return () => { cancelled = true; };
  }, [currentHour, saved.lastNotificationHour]);

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
    setSaved((current) => ({ ...current, lastCheckIn: Date.now() }));
    setCelebrating(true);
    window.setTimeout(() => setCelebrating(false), 1700);
  }, []);

  const testReminder = useCallback(() => {
    void (async () => {
      if (!(await ensureNotifyPermission())) return;
      await sendNotification({
        title: "CALL HER. TEXT HER!",
        body: "Test reminder: a tiny check-in still counts.",
      });
      setTesting(true);
      window.setTimeout(() => setTesting(false), 1700);
    })();
  }, []);

  const dragRegion = saved.dragUnlocked ? "" : undefined;
  const status = testing
    ? "test reminder sent."
    : celebrating
    ? "good. you made time for her."
    : `next reminder at ${hourLabel(nextReminder)}`;

  if (collapsed) {
    return (
      <button
        className="orb"
        style={{ ["--glass" as string]: String(saved.opacity) }}
        onClick={toggleCollapsed}
        title="Open Call Her"
        data-tauri-drag-region={dragRegion}
      >
        <img src={herPhoto} alt="" className="orb-photo" draggable={false} />
      </button>
    );
  }

  return (
    <main
      className={`widget ${celebrating ? "is-celebrating" : ""}`}
      style={{ ["--glass" as string]: String(saved.opacity) }}
      data-tauri-drag-region={dragRegion}
    >
      <div className="photo-wrap" data-tauri-drag-region={dragRegion}>
        <img src={herPhoto} alt="A favorite photo of her" className="photo" draggable={false} />
      </div>

      <section className="copy" data-tauri-drag-region={dragRegion}>
        <p className="kicker">love reminder</p>
        <h1>CALL HER.<br />TEXT HER!</h1>
        <p className="cry">She's gonna <em>CRY!!!</em></p>
        <p className="status">{status}</p>
      </section>

      <nav className="chrome" aria-label="Widget controls">
        <button className="icon-btn test" title="Send a test Windows notification" onClick={testReminder}>test</button>
        <button
          className={`icon-btn ${saved.dragUnlocked ? "on" : ""}`}
          title={saved.dragUnlocked ? "Lock widget position" : "Unlock to drag widget"}
          onClick={() => setSaved((current) => ({ ...current, dragUnlocked: !current.dragUnlocked }))}
        >
          {saved.dragUnlocked ? "lock" : "move"}
        </button>
        <button className="icon-btn" title="Minimize" onClick={toggleCollapsed}>min</button>
        <button className="icon-btn close" title="Close widget" onClick={() => getCurrentWindow().close()}>x</button>
      </nav>

      <footer className="footer">
        <button className="checkin" onClick={checkIn}>I checked in</button>
        <label className="opacity" title="Adjust widget transparency">
          <span>glass</span>
          <input type="range" min={0.28} max={0.94} step={0.02} value={saved.opacity} onChange={(event) => setSaved((current) => ({ ...current, opacity: Number(event.target.value) }))} />
        </label>
      </footer>
    </main>
  );
}
