// Estado do gerente de autocuidado.
// Hoje fica no aparelho (localStorage). A interface `rotinaRepository` é o ponto de troca
// para Firestore quando o backend tiver as coleções de rotina por cliente.
import { useSyncExternalStore } from "react";
import { cycleById, habitById } from "./catalog";
import { addDays, dateKey, matchCyclesForService, parseKey } from "./engine";

const STORAGE_KEY = "boracuidar.rotina.v1";

const EMPTY = Object.freeze({
  version: 1,
  onboarded: false,
  createdAt: null,
  raiox: null,
  raioxHistory: [],
  habits: [],
  cycles: [],
  logs: {},
  history: [],
  profile: { name: "" },
  moods: {},
  challenges: [],
  trails: {},
  readArticles: [],
  settings: { reminderTime: "08:00", eveningTime: "21:00", whatsapp: false, quietWeekend: false },
});

const rotinaRepository = {
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return EMPTY;
      const parsed = JSON.parse(raw);
      return { ...EMPTY, ...parsed };
    } catch {
      return EMPTY;
    }
  },
  save(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // sem armazenamento disponível: segue em memória
    }
  },
};

let current = typeof window === "undefined" ? EMPTY : rotinaRepository.load();
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

function commit(next) {
  current = next;
  rotinaRepository.save(next);
  emit();
}

function update(fn) {
  commit(fn(current));
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    current = rotinaRepository.load();
    emit();
  });
}

export function useRotina() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => EMPTY,
  );
}

export function getRotina() {
  return current;
}

/* ---------- ações ---------- */

export function completeOnboarding({ name = "", scores, priorities, habits, cycles }) {
  const today = dateKey();
  update((s) => ({
    ...s,
    profile: { ...(s.profile ?? {}), name: String(name).trim() },
    onboarded: true,
    createdAt: s.createdAt ?? today,
    raiox: { date: today, scores, priorities },
    raioxHistory: [...(s.raioxHistory ?? []), { date: today, scores }],
    habits,
    cycles: mergeCycles(cycles, s.cycles ?? []),
  }));
}

export function redoRaiox({ scores, priorities }) {
  const today = dateKey();
  update((s) => ({
    ...s,
    raiox: { date: today, scores, priorities },
    raioxHistory: [...(s.raioxHistory ?? []), { date: today, scores }],
  }));
}

function mergeCycles(next, previous) {
  // ciclos vindos de agendamentos antes do onboarding não se perdem
  const map = new Map(previous.map((c) => [c.id, c]));
  next.forEach((c) => {
    const old = map.get(c.id);
    const lastDate = [old?.lastDate, c.lastDate].filter(Boolean).sort().pop() ?? null;
    map.set(c.id, { ...c, lastDate });
  });
  return [...map.values()];
}

export function setHabitValue(habitId, key, value) {
  update((s) => {
    const day = { ...(s.logs?.[key] ?? {}) };
    if (value <= 0) delete day[habitId];
    else day[habitId] = value;
    return { ...s, logs: { ...s.logs, [key]: day } };
  });
}

export function addHabit(habitId) {
  const habit = habitById(habitId);
  if (!habit) return;
  update((s) => (s.habits.some((h) => h.id === habitId) ? s : { ...s, habits: [...s.habits, { ...habit }] }));
}

export function addCustomHabit(label) {
  const text = String(label ?? "").trim();
  if (!text) return;
  const id = `custom-${Date.now().toString(36)}`;
  update((s) => ({
    ...s,
    habits: [...s.habits, { id, label: text, dim: "tempo", kind: "check", target: 1, period: "day", icon: "check", custom: true }],
  }));
}

export function removeHabit(habitId) {
  update((s) => ({ ...s, habits: s.habits.filter((h) => h.id !== habitId) }));
}

export function addCycle(cycleId) {
  const c = cycleById(cycleId);
  if (!c) return;
  update((s) =>
    s.cycles.some((x) => x.id === cycleId)
      ? s
      : { ...s, cycles: [...s.cycles, { id: c.id, label: c.label, dim: c.dim, intervalDays: c.intervalDays, category: c.category, lastDate: null }] },
  );
}

export function removeCycle(cycleId) {
  update((s) => ({ ...s, cycles: s.cycles.filter((c) => c.id !== cycleId) }));
}

export function setCycleInterval(cycleId, intervalDays) {
  update((s) => ({ ...s, cycles: s.cycles.map((c) => (c.id === cycleId ? { ...c, intervalDays } : c)) }));
}

export function markCycleDone(cycleId, key = dateKey(), source = "manual", detail = "", bookingId = null) {
  update((s) => {
    const cycle = s.cycles.find((c) => c.id === cycleId);
    const catalog = cycleById(cycleId);
    const cycles = cycle
      ? s.cycles.map((c) => (c.id === cycleId ? { ...c, lastDate: !c.lastDate || key > c.lastDate ? key : c.lastDate } : c))
      : catalog
        ? [...s.cycles, { id: catalog.id, label: catalog.label, dim: catalog.dim, intervalDays: catalog.intervalDays, category: catalog.category, lastDate: key }]
        : s.cycles;
    const entry = { id: `${cycleId}-${key}-${source}`, cycleId, date: key, source, detail, bookingId };
    const history = [entry, ...(s.history ?? []).filter((h) => h.id !== entry.id)].slice(0, 200);
    return { ...s, cycles, history };
  });
}

// Chamado quando um agendamento é confirmado no marketplace.
export function registerBooking({ agendamentoId, serviceName, businessName, businessCategory, dateValue }) {
  const cycles = matchCyclesForService(serviceName, businessCategory);
  if (cycles.length === 0) return [];
  const already = (current.history ?? []).some((h) => h.bookingId && String(h.bookingId) === String(agendamentoId));
  if (already) return cycles;
  const key = normalizeDate(dateValue) ?? dateKey();
  const detail = [serviceName, businessName].filter(Boolean).join(" · ");
  cycles.forEach((cycle) => markCycleDone(cycle.id, key, "boracuidar", detail, agendamentoId ?? null));
  return cycles;
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value?.seconds) return dateKey(new Date(value.seconds * 1000));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : dateKey(d);
}

/* ---------- humor ---------- */

export function setMood(key, score, note) {
  update((s) => {
    const moods = { ...(s.moods ?? {}) };
    if (!score) delete moods[key];
    else moods[key] = { score, note: note ?? moods[key]?.note ?? "" };
    return { ...s, moods };
  });
}

/* ---------- desafios ---------- */

export function joinChallenge(id) {
  const today = dateKey();
  update((s) =>
    (s.challenges ?? []).some((c) => c.id === id && !c.endedAt)
      ? s
      : { ...s, challenges: [...(s.challenges ?? []).filter((c) => c.id !== id), { id, start: today }] },
  );
}

export function leaveChallenge(id) {
  update((s) => ({ ...s, challenges: (s.challenges ?? []).filter((c) => c.id !== id) }));
}

/* ---------- conteúdo ---------- */

export function toggleTrailStep(slug, index) {
  update((s) => {
    const done = new Set(s.trails?.[slug] ?? []);
    if (done.has(index)) done.delete(index);
    else done.add(index);
    return { ...s, trails: { ...(s.trails ?? {}), [slug]: [...done].sort((a, b) => a - b) } };
  });
}

export function markArticleRead(slug) {
  update((s) => ((s.readArticles ?? []).includes(slug) ? s : { ...s, readArticles: [...(s.readArticles ?? []), slug] }));
}

/* ---------- perfil e preferências ---------- */

export function updateProfile(patch) {
  update((s) => ({ ...s, profile: { ...(s.profile ?? {}), ...patch } }));
}

export function updateSettings(patch) {
  update((s) => ({ ...s, settings: { ...EMPTY.settings, ...(s.settings ?? {}), ...patch } }));
}

export function resetRotina() {
  commit({ ...EMPTY });
}

/* ---------- exemplo (só na prévia) ---------- */

export function loadDemo() {
  const today = dateKey();
  const created = addDays(today, -26);
  const habits = ["agua", "treino", "sono7", "respiracao", "skincare", "fio"].map((id) => ({ ...habitById(id) }));
  const logs = {};
  for (let i = 26; i >= 0; i -= 1) {
    const k = addDays(today, -i);
    const seed = (i * 7 + 3) % 10;
    const day = {};
    day.agua = i === 0 ? 5 : seed > 2 ? 8 : 5 + (seed % 3);
    if ([1, 3, 5].includes(parseKey(k).getDay()) && i !== 0) day.treino = 1;
    if (seed > 1) day.sono7 = 1;
    if (seed > 2 || i === 0) day.respiracao = 1;
    if (seed > 2 && i !== 0) day.skincare = 1;
    if (seed !== 4 && seed !== 7 && i !== 0) day.fio = 1;
    logs[k] = day;
  }
  const cycles = [
    { id: "corte", lastDate: addDays(today, -31) },
    { id: "dentista", lastDate: addDays(today, -172) },
    { id: "checkup", lastDate: addDays(today, -410) },
    { id: "sobrancelha", lastDate: addDays(today, -9) },
    { id: "terapia", lastDate: addDays(today, -5) },
  ].map(({ id, lastDate }) => {
    const c = cycleById(id);
    return { id, label: c.label, dim: c.dim, intervalDays: c.intervalDays, category: c.category, lastDate };
  });
  const scores = { movimento: 3, saude: 2, mente: 2, sono: 3, alimentacao: 3, aparencia: 4, tempo: 2 };
  const moods = {};
  const moodSeq = [4, 3, 4, 2, 3, 4, 5, 3, 3, 4, 2, 2, 3, 4, 4, 5, 4, 3, 3, 4, 3, 4, 4, 3, 2, 3];
  moodSeq.forEach((score, i) => {
    moods[addDays(today, -(moodSeq.length - i))] = { score, note: "" };
  });
  commit({
    ...EMPTY,
    profile: { name: "Marina" },
    moods,
    challenges: [{ id: "agua7", start: addDays(today, -4) }],
    trails: { "dormir-melhor": [0, 1, 2] },
    readArticles: ["dentista-6-meses"],
    onboarded: true,
    createdAt: created,
    raiox: { date: today, scores, priorities: ["saude", "mente", "tempo"] },
    raioxHistory: [
      { date: created, scores: { movimento: 2, saude: 2, mente: 1, sono: 2, alimentacao: 3, aparencia: 4, tempo: 2 } },
      { date: today, scores },
    ],
    habits,
    cycles,
    logs,
    history: [
      { id: "sobrancelha-d", cycleId: "sobrancelha", date: addDays(today, -9), source: "boracuidar", detail: "Design de sobrancelha · Studio Bela Pele" },
      { id: "terapia-d", cycleId: "terapia", date: addDays(today, -5), source: "manual", detail: "" },
      { id: "corte-d", cycleId: "corte", date: addDays(today, -31), source: "boracuidar", detail: "Corte masculino · Barbearia Dom Corte" },
    ],
  });
}
