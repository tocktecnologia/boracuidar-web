import { insertRow } from "./firestore";

const PERF_TABLE = "web_perf_events";
const SESSION_COUNT_KEY = "__bc_perf_log_count__";
const SESSION_LAST_KEY = "__bc_perf_log_last__";
const MAX_LOGS_PER_SESSION = 20;
const LOG_TTL_MS = 10 * 60 * 1000;
const SLOW_FLOW_MS = 2500;

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

function safeNavigator() {
  return typeof navigator !== "undefined" ? navigator : null;
}

function readSessionNumber(key) {
  const win = safeWindow();
  if (!win) return 0;

  try {
    const raw = win.sessionStorage.getItem(key);
    const parsed = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeSessionNumber(key, value) {
  const win = safeWindow();
  if (!win) return;

  try {
    win.sessionStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures on constrained/private devices.
  }
}

function normalizeError(error) {
  if (!error) return null;
  return {
    message: String(error?.message ?? error),
    code: String(error?.code ?? ""),
    name: String(error?.name ?? "Error"),
  };
}

function deviceContext() {
  const nav = safeNavigator();
  const win = safeWindow();
  const connection = nav?.connection ?? nav?.mozConnection ?? nav?.webkitConnection;

  return {
    route: win?.location?.pathname ?? "",
    search: win?.location?.search ?? "",
    user_agent: nav?.userAgent ?? "",
    language: nav?.language ?? "",
    platform: nav?.platform ?? "",
    viewport: win ? `${win.innerWidth}x${win.innerHeight}` : "",
    screen: win?.screen ? `${win.screen.width}x${win.screen.height}` : "",
    device_memory_gb: Number(nav?.deviceMemory ?? 0) || null,
    hardware_concurrency: Number(nav?.hardwareConcurrency ?? 0) || null,
    connection_type: String(connection?.effectiveType ?? ""),
    connection_downlink_mbps: Number(connection?.downlink ?? 0) || null,
    save_data: Boolean(connection?.saveData),
    online: typeof nav?.onLine === "boolean" ? nav.onLine : null,
  };
}

function canPersistEvent(fingerprint) {
  const count = readSessionNumber(SESSION_COUNT_KEY);
  if (count >= MAX_LOGS_PER_SESSION) return false;

  const win = safeWindow();
  if (!win) return true;

  try {
    const now = Date.now();
    const lastMap = JSON.parse(win.sessionStorage.getItem(SESSION_LAST_KEY) ?? "{}");
    const lastTime = Number(lastMap?.[fingerprint] ?? 0);
    if (lastTime && now - lastTime < LOG_TTL_MS) return false;
    lastMap[fingerprint] = now;
    win.sessionStorage.setItem(SESSION_LAST_KEY, JSON.stringify(lastMap));
    writeSessionNumber(SESSION_COUNT_KEY, count + 1);
    return true;
  } catch {
    writeSessionNumber(SESSION_COUNT_KEY, count + 1);
    return true;
  }
}

export function queuePerfEvent({
  name,
  durationMs = null,
  context = {},
  error = null,
  force = false,
}) {
  const roundedDuration = Number.isFinite(durationMs) ? Math.round(durationMs) : null;
  const normalizedError = normalizeError(error);

  if (!force && !normalizedError && !(roundedDuration >= SLOW_FLOW_MS)) {
    return;
  }

  const fingerprint = `${name}|${context.businessId ?? ""}|${normalizedError?.code ?? ""}|${normalizedError?.message ?? ""}`;
  if (!canPersistEvent(fingerprint)) return;

  Promise.resolve().then(async () => {
    try {
      await insertRow({
        table: PERF_TABLE,
        data: {
          name,
          duration_ms: roundedDuration,
          context,
          error: normalizedError,
          created_at: new Date(),
          ...deviceContext(),
        },
      });
    } catch {
      // Never fail the user flow because telemetry failed.
    }
  });
}

export async function measureAsync(name, task, context = {}) {
  const startedAt = performance.now();
  try {
    const result = await task();
    queuePerfEvent({
      name,
      durationMs: performance.now() - startedAt,
      context,
    });
    return result;
  } catch (error) {
    queuePerfEvent({
      name,
      durationMs: performance.now() - startedAt,
      context,
      error,
      force: true,
    });
    throw error;
  }
}
