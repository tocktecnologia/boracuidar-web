// Regras puras do gerente de autocuidado: datas, progresso, ciclos, sequência e conquistas.
import { ACHIEVEMENTS, CYCLE_CATALOG, DIMENSIONS, PLAN_BY_DIMENSION, TIPS, cycleById, habitById } from "./catalog";

const DAY = 24 * 60 * 60 * 1000;

export function dateKey(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(key, days) {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function daysBetween(fromKey, toKey) {
  return Math.round((parseKey(toKey) - parseKey(fromKey)) / DAY);
}

// Semana começa na segunda.
export function weekStart(key) {
  const d = parseKey(key);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return dateKey(d);
}

export function weekDays(key) {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function formatDayLong(key) {
  return parseKey(key).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

export function formatDayShort(key) {
  return parseKey(key).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function formatInterval(days) {
  if (days % 365 === 0) return days === 365 ? "1 ano" : `${days / 365} anos`;
  if (days >= 60 && days % 30 === 0) return `${days / 30} meses`;
  if (days === 540) return "18 meses";
  if (days % 7 === 0 && days <= 28) return days === 7 ? "1 semana" : `${days / 7} semanas`;
  return `${days} dias`;
}

/* ---------- hábitos ---------- */

export function habitValue(state, habitId, key) {
  return Number(state.logs?.[key]?.[habitId] ?? 0);
}

export function habitDone(habit, value) {
  if (habit.period === "week") return value >= 1;
  return value >= (habit.target || 1);
}

// Progresso de 0 a 1 de um hábito na semana que contém `key`.
export function habitWeekProgress(state, habit, key) {
  const days = weekDays(key);
  if (habit.period === "week") {
    const count = days.filter((d) => habitValue(state, habit.id, d) >= 1).length;
    return { done: count, expected: habit.target, ratio: Math.min(1, count / habit.target) };
  }
  // hábitos diários contam só os dias já vividos com a rotina ativa (inclui hoje)
  const today = dateKey();
  const created = state.createdAt ?? today;
  const considered = days.filter((d) => d <= today && d >= created);
  const count = considered.filter((d) => habitDone(habit, habitValue(state, habit.id, d))).length;
  const expected = Math.max(1, considered.length);
  return { done: count, expected, ratio: count / expected };
}

export function weekScore(state, key) {
  const habits = state.habits ?? [];
  if (habits.length === 0) return 0;
  const sum = habits.reduce((acc, habit) => acc + habitWeekProgress(state, habit, key).ratio, 0);
  return sum / habits.length;
}

export const WEEK_GOAL = 0.7;

export function weekStreak(state, todayKey = dateKey()) {
  const startedAt = state.createdAt ? weekStart(state.createdAt) : weekStart(todayKey);
  let streak = 0;
  let cursor = weekStart(todayKey);
  // a semana atual conta se já bateu a meta; se não, não quebra a sequência ainda
  if (weekScore(state, cursor) >= WEEK_GOAL) streak += 1;
  cursor = addDays(cursor, -7);
  while (cursor >= startedAt) {
    if (weekScore(state, cursor) >= WEEK_GOAL) {
      streak += 1;
      cursor = addDays(cursor, -7);
    } else break;
  }
  return streak;
}

export function dayProgress(state, key) {
  const daily = (state.habits ?? []).filter((h) => h.period !== "week");
  if (daily.length === 0) return 0;
  const done = daily.filter((h) => habitDone(h, habitValue(state, h.id, key))).length;
  return done / daily.length;
}

/* ---------- ciclos ---------- */

export function cycleStatus(cycle, todayKey = dateKey()) {
  if (!cycle.lastDate) {
    return { tone: "unknown", label: "Sem registro", ratio: 0, daysLeft: null, dueDate: null };
  }
  if (cycle.lastDate > todayKey) {
    return { tone: "scheduled", label: `Agendado para ${formatDayShort(cycle.lastDate)}`, ratio: 0, daysLeft: cycle.intervalDays, dueDate: addDays(cycle.lastDate, cycle.intervalDays) };
  }
  const elapsed = daysBetween(cycle.lastDate, todayKey);
  const daysLeft = cycle.intervalDays - elapsed;
  const dueDate = addDays(cycle.lastDate, cycle.intervalDays);
  const ratio = Math.max(0, Math.min(1, elapsed / cycle.intervalDays));
  if (daysLeft < 0) return { tone: "late", label: `Venceu há ${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? "dia" : "dias"}`, ratio: 1, daysLeft, dueDate };
  if (daysLeft === 0) return { tone: "due", label: "Vence hoje", ratio, daysLeft, dueDate };
  if (daysLeft <= Math.max(3, Math.round(cycle.intervalDays * 0.15))) {
    return { tone: "due", label: `Vence em ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}`, ratio, daysLeft, dueDate };
  }
  return { tone: "ok", label: `Em dia · próximo em ${formatDayShort(dueDate)}`, ratio, daysLeft, dueDate };
}

// Ordem de atenção: vencidos, vencendo, sem registro, em dia.
export function sortCyclesByAttention(cycles, todayKey = dateKey()) {
  const rank = { late: 0, due: 1, unknown: 2, scheduled: 3, ok: 4 };
  return [...cycles].sort((a, b) => {
    const sa = cycleStatus(a, todayKey);
    const sb = cycleStatus(b, todayKey);
    if (rank[sa.tone] !== rank[sb.tone]) return rank[sa.tone] - rank[sb.tone];
    return (sa.daysLeft ?? 9999) - (sb.daysLeft ?? 9999);
  });
}

// Descobre os ciclos de um serviço agendado pelo nome ("Corte + barba" fecha os dois).
export function matchCyclesForService(serviceName = "", businessCategory = "") {
  const text = `${serviceName}`.toLowerCase();
  const hits = CYCLE_CATALOG.filter((cycle) => cycle.keywords.some((kw) => text.includes(kw)));
  if (hits.length > 0) return hits;
  if (/barbearia/i.test(businessCategory)) return [cycleById("corte")];
  return [];
}

/* ---------- plano inicial ---------- */

export function lowestDimensions(scores, count = 3) {
  return DIMENSIONS.map((d) => ({ id: d.id, score: scores[d.id] ?? 3 }))
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((d) => d.id);
}

export function buildPlan(priorities, lastTimes = {}, todayKey = dateKey()) {
  const habitIds = new Set(["agua"]);
  const cycleIds = new Set(Object.keys(lastTimes).filter((id) => lastTimes[id] !== undefined));
  priorities.forEach((dim) => {
    const plan = PLAN_BY_DIMENSION[dim];
    if (!plan) return;
    plan.habits.slice(0, 2).forEach((id) => habitIds.add(id));
    plan.cycles.forEach((id) => cycleIds.add(id));
  });
  if (habitIds.size < 4) habitIds.add("sono7");
  if (habitIds.size < 4) habitIds.add("fruta");

  const habits = [...habitIds].map((id) => ({ ...habitById(id) })).filter((h) => h.id);
  const cycles = [...cycleIds]
    .map((id) => cycleById(id))
    .filter(Boolean)
    .map((c) => ({
      id: c.id,
      label: c.label,
      dim: c.dim,
      intervalDays: c.intervalDays,
      category: c.category,
      lastDate: lastTimes[c.id] == null ? null : addDays(todayKey, -lastTimes[c.id]),
    }));
  return { habits, cycles };
}

/* ---------- conteúdo ---------- */

export function tipOfDay(priorities = [], key = dateKey()) {
  const pool = TIPS.filter((t) => priorities.includes(t.dim));
  const list = pool.length > 0 ? pool : TIPS;
  const n = Math.abs(Math.floor(parseKey(key).getTime() / DAY));
  return list[n % list.length];
}

/* ---------- conquistas ---------- */

export function unlockedAchievements(state, todayKey = dateKey()) {
  const unlocked = new Set();
  if (state.raiox) unlocked.add("raiox");

  const startWeek = state.createdAt ? weekStart(state.createdAt) : weekStart(todayKey);
  for (let w = weekStart(todayKey); w >= startWeek; w = addDays(w, -7)) {
    if (weekScore(state, w) >= WEEK_GOAL) { unlocked.add("semana"); break; }
  }

  const agua = (state.habits ?? []).find((h) => h.id === "agua");
  if (agua) {
    const daysHit = Object.keys(state.logs ?? {}).filter((k) => habitValue(state, "agua", k) >= agua.target).length;
    if (daysHit >= 7) unlocked.add("agua7");
  }
  const treinos = Object.keys(state.logs ?? {}).filter((k) => habitValue(state, "treino", k) >= 1).length;
  if (treinos >= 12) unlocked.add("treino12");
  if (weekStreak(state, todayKey) >= 4) unlocked.add("sequencia4");
  if ((state.history ?? []).some((h) => h.source === "boracuidar")) unlocked.add("agendou");

  const cycles = state.cycles ?? [];
  const inDate = (id) => cycles.some((c) => c.id === id && c.lastDate && cycleStatus(c, todayKey).tone !== "late");
  if (inDate("dentista")) unlocked.add("dentista");
  if (inDate("checkup")) unlocked.add("checkup");
  if (cycles.length >= 3 && cycles.every((c) => c.lastDate && cycleStatus(c, todayKey).tone !== "late")) unlocked.add("tudoemdia");

  return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: unlocked.has(a.id) }));
}

/* ---------- desafios ---------- */

export function challengeProgress(state, challenge, start, todayKey = dateKey()) {
  let done = 0;
  for (let k = start; k <= todayKey; k = addDays(k, 1)) {
    const hit = challenge.habits.some((id) => {
      const habit = (state.habits ?? []).find((h) => h.id === id);
      const value = habitValue(state, id, k);
      return habit ? habitDone({ ...habit, period: "day" }, value) : value >= 1;
    });
    if (hit) done += 1;
  }
  return { done: Math.min(done, challenge.days), total: challenge.days, complete: done >= challenge.days };
}

/* ---------- humor ---------- */

export function moodSeries(state, days = 30, todayKey = dateKey()) {
  return Array.from({ length: days }, (_, i) => {
    const key = addDays(todayKey, -(days - 1 - i));
    return { key, score: state.moods?.[key]?.score ?? null };
  });
}

// Humor baixo (1 ou 2) em pelo menos 4 dos últimos 7 registros.
export function lowMoodStretch(state, todayKey = dateKey()) {
  const recent = moodSeries(state, 10, todayKey).filter((d) => d.score != null).slice(-7);
  if (recent.length < 4) return false;
  return recent.filter((d) => d.score <= 2).length >= 4;
}

/* ---------- agenda ---------- */

export function upcomingBookings(state, todayKey = dateKey()) {
  return (state.history ?? [])
    .filter((h) => h.source === "boracuidar" && h.date >= todayKey)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
