import { auth } from "./firebase-auth";

const fallbackApiUrl = "https://boracuidar-booking-api-282314346925.us-central1.run.app";

function apiUrl() {
  return String(import.meta.env.VITE_BOOKING_API_URL ?? fallbackApiUrl).replace(/\/+$/, "");
}

export async function finalizeOnboarding(payload) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Nao foi possivel autenticar o email confirmado.");

  const response = await fetch(`${apiUrl()}/api/boracuidar/onboarding/finalize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) {
    throw new Error(body.message || "Nao foi possivel concluir o cadastro.");
  }
  return body.data;
}
