function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

export function readSessionCache(key, maxAgeMs) {
  const win = safeWindow();
  if (!win) return null;

  try {
    const raw = win.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt ?? 0);
    if (!savedAt || Date.now() - savedAt > maxAgeMs) {
      win.sessionStorage.removeItem(key);
      return null;
    }

    return parsed?.value ?? null;
  } catch {
    return null;
  }
}

export function writeSessionCache(key, value) {
  const win = safeWindow();
  if (!win) return;

  try {
    win.sessionStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      value,
    }));
  } catch {
    // Ignore storage failures on constrained/private devices.
  }
}
