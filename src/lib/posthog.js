import posthog from "posthog-js";

let initialized = false;

function cleanEnv(value) {
  return String(value ?? "").trim();
}

export function posthogProjectKey() {
  return cleanEnv(import.meta.env.VITE_PUBLIC_POSTHOG_KEY);
}

export function posthogHost() {
  return cleanEnv(import.meta.env.VITE_PUBLIC_POSTHOG_HOST) || "https://us.i.posthog.com";
}

export function isPostHogEnabled() {
  return Boolean(posthogProjectKey());
}

function bookingApiHostnames() {
  const rawUrl = cleanEnv(import.meta.env.VITE_BOOKING_API_URL);
  if (!rawUrl) return [];

  try {
    return [new URL(rawUrl).hostname];
  } catch {
    return [];
  }
}

export function initPostHog() {
  if (initialized || !isPostHogEnabled()) return posthog;

  posthog.init(posthogProjectKey(), {
    api_host: posthogHost(),
    defaults: "2026-01-30",
    autocapture: true,
    capture_pageleave: true,
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: {
        password: true,
        email: true,
        tel: true,
      },
    },
    person_profiles: "identified_only",
    persistence: "localStorage+cookie",
    tracing_headers: bookingApiHostnames(),
  });

  initialized = true;
  return posthog;
}

function sanitizeProperties(properties = {}) {
  const entries = Object.entries(properties).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries);
}

export function captureEvent(name, properties = {}) {
  if (!isPostHogEnabled()) return;
  posthog.capture(name, sanitizeProperties(properties));
}

export default posthog;
