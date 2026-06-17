export function bookingApiBaseUrl() {
  const raw = String(import.meta.env.VITE_BOOKING_API_URL ?? "").trim();
  return raw.replace(/\/+$/, "");
}

export function isBookingApiEnabled() {
  return Boolean(bookingApiBaseUrl());
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

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    const error = new Error(data?.message || "Falha ao criar agendamento pelo backend.");
    if (data?.code) error.code = data.code;
    throw error;
  }

  return data;
}
