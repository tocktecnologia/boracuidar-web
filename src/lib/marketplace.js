export const BUSINESS_TYPE_LABELS = {
  BARBEARIA: "Barbearia",
  SALAO_BELEZA: "Salao de beleza",
  CLINICA: "Clinica",
  ESTUDIO_ESTETICA: "Estetica",
  HOMECARE: "Home Care",
  PERSONAL: "Personal",
  SERVICOS_GERAIS: "Servicos gerais",
  SERVICO_PERSONALIZADO: "Personalizado",
  PETSHOPS_VETERINARIO: "Pet/Veterinario",
  SURF: "Surf",
};

export const FALLBACK_COVERS = [
  "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1503951458645-643d53bfd90f?auto=format&fit=crop&w=1400&q=80",
];

export function firstText(values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
}

export function toInt(value) {
  if (typeof value === "number") return Math.trunc(value);
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function toNumber(value, fallback = 0) {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(String(value ?? "").replace(",", ".").trim());
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "sim";
}

export function typeLabel(value) {
  const key = String(value ?? "").trim();
  if (!key) return "Servicos";
  if (BUSINESS_TYPE_LABELS[key]) return BUSINESS_TYPE_LABELS[key];
  return key
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function extractPageFromBusiness(business, preferPending = false) {
  const candidates = preferPending
    ? [business?.page_pending, business?.page_published, business?.page]
    : [business?.page_published, business?.page];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return { ...candidate, business_id: business?.id };
    }
  }

  return null;
}

export function coverFromPageOrBusiness(page, business, index = 0) {
  const cover = firstText([
    page?.cover_photo,
    page?.cover_photo_url,
    page?.cover,
    page?.hero_image,
    page?.logo_url,
    business?.cover_photo,
    business?.cover_photo_url,
    business?.foto_url,
    business?.logo_url,
  ]);

  if (cover?.startsWith("http")) return cover;
  return FALLBACK_COVERS[index % FALLBACK_COVERS.length];
}

export function evaluationSummary(rows) {
  let count = 0;
  let sum = 0;
  for (const row of rows) {
    const stars = toInt(row?.stars ?? row?.rating ?? row?.nota);
    if (stars == null || stars < 1 || stars > 5) continue;
    count += 1;
    sum += stars;
  }
  return { count, average: count === 0 ? 0 : sum / count };
}

export function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(toNumber(value));
}

export function formatDate(value) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "--/--/----";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function whatsappHref(value) {
  const digits = digitsOnly(value);
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

export function reviewPath(businessId) {
  return `/marketplace/business/reviews?businessId=${encodeURIComponent(businessId)}`;
}

export function asDateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function parseDate(value) {
  if (value instanceof Date) return value;
  const parsed = new Date(String(value ?? "").trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseTimeOnDate(date, value) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), value.getHours(), value.getMinutes());
  }

  const text = String(value).trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  if (match) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(match[1]), Number(match[2]));
  }

  const parsed = parseDate(text);
  if (parsed) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), parsed.getHours(), parsed.getMinutes());
  }

  return null;
}

export function sameMinute(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours() &&
    a.getMinutes() === b.getMinutes()
  );
}

export function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}
