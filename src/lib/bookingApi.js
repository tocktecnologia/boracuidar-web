export function bookingApiBaseUrl() {
  const raw = String(import.meta.env.VITE_BOOKING_API_URL ?? "").trim();
  return raw.replace(/\/+$/, "");
}

export function isBookingApiEnabled() {
  return Boolean(bookingApiBaseUrl());
}

async function readApiResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    const error = new Error(data?.message || fallbackMessage);
    if (data?.code) error.code = data.code;
    throw error;
  }
  return data;
}

export async function loadBookingBootstrap(businessId) {
  const baseUrl = bookingApiBaseUrl();
  if (!baseUrl) {
    throw new Error("VITE_BOOKING_API_URL nao configurada.");
  }

  const url = new URL(`${baseUrl}/api/bookings/bootstrap`);
  url.searchParams.set("businessId", String(businessId ?? "").trim());

  const response = await fetch(url);
  return readApiResponse(response, "Falha ao carregar bootstrap do agendamento.");
}

export async function loadBookingAvailability({
  businessId,
  workerId,
  durationMinutes,
  fromDateKey,
  selectedDateKey,
  days,
}) {
  const baseUrl = bookingApiBaseUrl();
  if (!baseUrl) {
    throw new Error("VITE_BOOKING_API_URL nao configurada.");
  }

  const url = new URL(`${baseUrl}/api/bookings/availability`);
  url.searchParams.set("businessId", String(businessId ?? "").trim());
  url.searchParams.set("workerId", String(workerId ?? ""));
  url.searchParams.set("durationMinutes", String(durationMinutes ?? 30));
  url.searchParams.set("fromDateKey", String(fromDateKey ?? "").trim());
  url.searchParams.set("selectedDateKey", String(selectedDateKey ?? "").trim());
  url.searchParams.set("days", String(days ?? 1));

  const response = await fetch(url);
  return readApiResponse(response, "Falha ao carregar disponibilidade.");
}

export async function createBookingViaApi(payload) {
  const baseUrl = bookingApiBaseUrl();
  if (!baseUrl) {
    throw new Error("VITE_BOOKING_API_URL nao configurada.");
  }

  const response = await fetch(`${baseUrl}/api/bookings/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return readApiResponse(response, "Falha ao criar agendamento pelo backend.");
}
