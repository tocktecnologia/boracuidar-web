/* global process */

import cors from "cors";
import express from "express";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const app = express();

const BOOKING_SLOT_LOCKS_TABLE = "agendamento_slot_locks";
const BOOKING_LOCK_STEP_MINUTES = 5;
const BOOKING_SLOT_TAKEN_CODE = "booking/slot-taken";
const BOOKING_SLOT_UNAVAILABLE_CODE = "booking/slot-unavailable";

const DEFAULT_SUBSCRIPTIONS = [
  { name: "free", label: "Free", max_schedules_month: 100, max_pre_reminder: 20, allow_n8n: false, block_all_n8n: true },
  { name: "basic", label: "Basic", max_schedules_month: 300, max_pre_reminder: 100, allow_n8n: false, block_all_n8n: false },
  { name: "premium", label: "Premium", max_schedules_month: 500, max_pre_reminder: 200, allow_n8n: false, block_all_n8n: false },
  { name: "mega", label: "Mega", max_schedules_month: 900, max_pre_reminder: 900, allow_n8n: true, block_all_n8n: false },
];

app.use(cors({ origin: true }));
app.use(express.json({ limit: "512kb" }));

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "sim";
}

function normalizeSubscriptionName(raw) {
  const text = String(raw ?? "").trim().toLowerCase();
  if (text === "pro") return "premium";
  if (DEFAULT_SUBSCRIPTIONS.some((item) => item.name === text)) return text;
  return "free";
}

function subscriptionPolicyByName(raw) {
  const normalized = normalizeSubscriptionName(raw);
  return DEFAULT_SUBSCRIPTIONS.find((item) => item.name === normalized) ?? DEFAULT_SUBSCRIPTIONS[0];
}

function reminderCountForBusinessRow(businessRow) {
  const policy = subscriptionPolicyByName(businessRow?.subscription);
  return Number(policy.max_pre_reminder) > 0 ? 0 : -1;
}

function shouldBlockN8nForBusinessRow(businessRow) {
  const policy = subscriptionPolicyByName(businessRow?.subscription);
  return !toBool(policy.allow_n8n) || toBool(policy.block_all_n8n);
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateOnlyIsoLocal(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    const dateOnly = parseDateOnlyIsoLocal(text);
    if (dateOnly) return dateOnly;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function parseClockToMinute(value) {
  if (value instanceof Date) {
    return value.getHours() * 60 + value.getMinutes();
  }

  const text = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  const parsed = parseDate(text);
  if (!parsed) return null;
  return parsed.getHours() * 60 + parsed.getMinutes();
}

function parseMinuteRange(startValue, endValue) {
  const start = parseClockToMinute(startValue);
  const end = parseClockToMinute(endValue);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

function overlapsMinuteRanges(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function normalizeExceptionType(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDateKey(value) {
  const text = String(value ?? "").trim();
  const prefix = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (prefix) return prefix[1];
  const parsed = parseDate(text);
  if (!parsed) return null;
  return formatDateKey(parsed);
}

function sanitizeLockKeyPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
}

function slotLockDocId({ businessId, workerId, dateKey, minuteOfDay }) {
  const normalizedDate = String(dateKey ?? "").replace(/-/g, "");
  return `${sanitizeLockKeyPart(businessId)}__${sanitizeLockKeyPart(workerId)}__${normalizedDate}__${String(minuteOfDay).padStart(4, "0")}`;
}

function slotLockIdsForRange({ businessId, workerId, dateKey, startTime, endTime }) {
  const startMinute = parseClockToMinute(startTime);
  const endMinute = parseClockToMinute(endTime);
  if (startMinute == null || endMinute == null || endMinute <= startMinute) return [];

  const ids = [];
  const lockStartMinute = Math.floor(startMinute / BOOKING_LOCK_STEP_MINUTES) * BOOKING_LOCK_STEP_MINUTES;
  const lockEndMinute = Math.ceil(endMinute / BOOKING_LOCK_STEP_MINUTES) * BOOKING_LOCK_STEP_MINUTES;

  for (let cursor = lockStartMinute; cursor < lockEndMinute; cursor += BOOKING_LOCK_STEP_MINUTES) {
    ids.push(slotLockDocId({ businessId, workerId, dateKey, minuteOfDay: cursor }));
  }
  return ids;
}

function buildSlotTakenError() {
  const error = new Error("Este horario acabou de ser preenchido por outra pessoa. Escolha outro horario.");
  error.code = BOOKING_SLOT_TAKEN_CODE;
  return error;
}

function buildSlotUnavailableError(message = "Esse horario nao cabe na disponibilidade atual do profissional.") {
  const error = new Error(message);
  error.code = BOOKING_SLOT_UNAVAILABLE_CODE;
  return error;
}

function isCancelledStatus(status) {
  const text = String(status ?? "").trim().toLowerCase();
  return text === "cancelado" || text === "canceled" || text === "cancelled";
}

function generateIntId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function normalizeScheduleInputs(schedules) {
  const normalized = schedules
    .map((item) => ({
      serviceId: Number(item?.serviceId),
      startTime: String(item?.startTime ?? "").trim(),
      endTime: String(item?.endTime ?? "").trim(),
    }))
    .filter((item) => Number.isFinite(item.serviceId) && item.serviceId > 0 && item.startTime && item.endTime)
    .map((item) => {
      const startMinute = parseClockToMinute(item.startTime);
      const endMinute = parseClockToMinute(item.endTime);
      if (startMinute == null || endMinute == null || endMinute <= startMinute) {
        throw new Error("Horario de servico invalido.");
      }
      return { ...item, startMinute, endMinute };
    })
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  if (normalized.length === 0) {
    throw new Error("Nenhum servico valido para agendamento.");
  }

  for (let index = 1; index < normalized.length; index += 1) {
    const prev = normalized[index - 1];
    const current = normalized[index];
    if (overlapsMinuteRanges(prev.startMinute, prev.endMinute, current.startMinute, current.endMinute)) {
      throw buildSlotUnavailableError("Os servicos selecionados se sobrepoem. Revise os horarios.");
    }
  }

  return normalized;
}

async function readBusinessById(businessId) {
  const snapshot = await db.collection("business").doc(String(businessId)).get();
  if (!snapshot.exists) return null;
  return snapshot.data() ?? null;
}

async function readServiceById(serviceId) {
  const snapshot = await db.collection("servicos").doc(String(serviceId)).get();
  if (!snapshot.exists) return null;
  return snapshot.data() ?? null;
}

async function readWorkerById(workerId) {
  const snapshot = await db.collection("trabalhadores").doc(String(workerId)).get();
  if (!snapshot.exists) return null;
  return snapshot.data() ?? null;
}

async function queryCollection(table, predicates = []) {
  let ref = db.collection(table);
  for (const predicate of predicates) {
    ref = ref.where(predicate.field, predicate.op, predicate.value);
  }
  const snapshot = await ref.get();
  return snapshot.docs.map((docSnap) => docSnap.data());
}

async function workerAvailabilityForDay({ businessId, workerId, dateKey }) {
  const targetDate = parseDateOnlyIsoLocal(String(dateKey ?? "").trim());
  if (!targetDate) return null;

  const weekDay = targetDate.getDay();
  const workRows = await queryCollection("horarios_padrao", [
    { field: "trabalhador_id", op: "==", value: workerId },
    { field: "dia_semana", op: "==", value: weekDay },
    { field: "business_id", op: "==", value: businessId },
    { field: "ativo", op: "==", value: true },
  ]);

  const baseWorkRow =
    workRows.find((row) => parseMinuteRange(row.hora_inicio ?? row.start_time ?? row.start, row.hora_fim ?? row.end_time ?? row.end)) ??
    null;
  if (!baseWorkRow) return null;

  const baseWorkRange = parseMinuteRange(
    baseWorkRow.hora_inicio ?? baseWorkRow.start_time ?? baseWorkRow.start,
    baseWorkRow.hora_fim ?? baseWorkRow.end_time ?? baseWorkRow.end,
  );
  if (!baseWorkRange) return null;

  let workStart = baseWorkRange.start;
  let workEnd = baseWorkRange.end;

  let breakStart = parseClockToMinute(
    baseWorkRow.intervalo_inicio ?? baseWorkRow.hora_pausa_inicio ?? baseWorkRow.break_start ?? baseWorkRow.lunch_start,
  );
  let breakEnd = parseClockToMinute(
    baseWorkRow.intervalo_fim ?? baseWorkRow.hora_pausa_fim ?? baseWorkRow.break_end ?? baseWorkRow.lunch_end,
  );
  if (breakStart == null || breakEnd == null || breakEnd <= breakStart) {
    breakStart = null;
    breakEnd = null;
  }

  const exceptionRows = await queryCollection("horarios_excecoes", [
    { field: "trabalhador_id", op: "==", value: workerId },
    { field: "data", op: "==", value: dateKey },
    { field: "business_id", op: "==", value: businessId },
  ]);

  if (exceptionRows.some((entry) => normalizeExceptionType(entry?.tipo) === "folga")) {
    return null;
  }

  for (const entry of exceptionRows) {
    if (normalizeExceptionType(entry?.tipo) !== "personalizado") continue;

    const customRange = parseMinuteRange(entry.hora_inicio ?? entry.start_time, entry.hora_fim ?? entry.end_time);
    if (customRange) {
      workStart = customRange.start;
      workEnd = customRange.end;
    }

    const customBreakRange = parseMinuteRange(
      entry.intervalo_inicio ?? entry.hora_pausa_inicio ?? entry.break_start,
      entry.intervalo_fim ?? entry.hora_pausa_fim ?? entry.break_end,
    );
    if (customBreakRange) {
      breakStart = customBreakRange.start;
      breakEnd = customBreakRange.end;
    }
  }

  const blocked = [];
  for (const entry of exceptionRows) {
    if (normalizeExceptionType(entry?.tipo) !== "bloqueio") continue;
    const blockedRange = parseMinuteRange(entry.hora_inicio ?? entry.start_time, entry.hora_fim ?? entry.end_time);
    if (blockedRange) blocked.push(blockedRange);
  }

  return { workStart, workEnd, breakStart, breakEnd, blocked };
}

async function checkScheduleCreationLimit({ businessId, additionalSchedules = 1, workerId = null, referenceDate = new Date(), businessRow = null }) {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
  const monthStartKey = formatDateKey(monthStart);
  const monthEndKey = formatDateKey(monthEnd);

  const rows = await queryCollection("agendamentos", [
    { field: "business_id", op: "==", value: businessId },
    { field: "data_agendamento", op: ">=", value: monthStartKey },
    { field: "data_agendamento", op: "<", value: monthEndKey },
    ...(workerId != null ? [{ field: "trabalhador_id", op: "==", value: workerId }] : []),
  ]);

  const resolvedBusiness = businessRow ?? await readBusinessById(businessId) ?? {};
  const policy = subscriptionPolicyByName(resolvedBusiness.subscription);

  const inMonth = rows.filter((row) => {
    const date = parseDate(row.data_agendamento);
    if (!date) return false;
    if (date < monthStart || date >= monthEnd) return false;
    if (isCancelledStatus(row.status)) return false;
    if (workerId != null && Number(row.trabalhador_id) !== Number(workerId)) return false;
    return true;
  });

  const monthlyLimit = Number(policy.max_schedules_month ?? 0);
  if (monthlyLimit > 0 && inMonth.length + Math.max(1, additionalSchedules) > monthlyLimit) {
    return {
      allowed: false,
      message: `Limite do plano ${policy.label} atingido: ${monthlyLimit} agendamentos por mes.`,
      current: inMonth.length,
      limit: monthlyLimit,
      plan: policy.name,
    };
  }

  return { allowed: true, policy, plan: policy.name };
}

async function createSchedulesAtomically({ businessId, workerId, customerName, customerPhone, dateKey, reminderCount = -1, status = "confirmado", schedules = [] }) {
  const normalizedBusinessId = String(businessId ?? "").trim();
  const normalizedDateKey = normalizeDateKey(dateKey);
  const normalizedWorkerId = Number(workerId);
  const cleanCustomerName = String(customerName ?? "").trim();
  const cleanCustomerPhone = String(customerPhone ?? "").trim();

  if (!normalizedBusinessId) throw new Error("businessId ausente.");
  if (!normalizedDateKey) throw new Error("Data de agendamento invalida.");
  if (!Number.isFinite(normalizedWorkerId) || normalizedWorkerId <= 0) throw new Error("Profissional invalido.");
  if (!cleanCustomerName) throw new Error("Nome do cliente e obrigatorio.");
  if (!cleanCustomerPhone) throw new Error("Telefone do cliente e obrigatorio.");

  const normalizedSchedules = normalizeScheduleInputs(schedules);
  const availability = await workerAvailabilityForDay({
    businessId: normalizedBusinessId,
    workerId: normalizedWorkerId,
    dateKey: normalizedDateKey,
  });
  if (!availability) {
    throw buildSlotUnavailableError("O profissional nao possui disponibilidade para esse dia.");
  }

  for (const schedule of normalizedSchedules) {
    if (schedule.startMinute < availability.workStart || schedule.endMinute > availability.workEnd) {
      throw buildSlotUnavailableError("Esse servico nao cabe no horario de atendimento do profissional.");
    }
    if (
      availability.breakStart != null &&
      availability.breakEnd != null &&
      overlapsMinuteRanges(schedule.startMinute, schedule.endMinute, availability.breakStart, availability.breakEnd)
    ) {
      throw buildSlotUnavailableError("Esse servico invade o intervalo do profissional. Escolha outro horario.");
    }
    if (availability.blocked.some((blocked) => overlapsMinuteRanges(schedule.startMinute, schedule.endMinute, blocked.start, blocked.end))) {
      throw buildSlotTakenError();
    }
  }

  const preparedSchedules = normalizedSchedules.map((item) => ({
    id: generateIntId(),
    business_id: normalizedBusinessId,
    trabalhador_id: normalizedWorkerId,
    servico_id: item.serviceId,
    cliente_nome: cleanCustomerName,
    cliente_telefone: cleanCustomerPhone,
    data_agendamento: normalizedDateKey,
    hora_inicio: item.startTime,
    hora_fim: item.endTime,
    status,
    lembrete_count: reminderCount,
    cliente_endereco: "",
    created_at: new Date(),
  }));

  const lockRefsById = new Map();
  for (const schedule of preparedSchedules) {
    const lockIds = slotLockIdsForRange({
      businessId: normalizedBusinessId,
      workerId: normalizedWorkerId,
      dateKey: normalizedDateKey,
      startTime: schedule.hora_inicio,
      endTime: schedule.hora_fim,
    });
    if (lockIds.length === 0) {
      throw new Error("Horario invalido para bloqueio.");
    }
    schedule.lock_ids = lockIds;
    for (const lockId of lockIds) {
      if (!lockRefsById.has(lockId)) {
        lockRefsById.set(lockId, db.collection(BOOKING_SLOT_LOCKS_TABLE).doc(lockId));
      }
    }
  }

  const existingDayRows = await queryCollection("agendamentos", [
    { field: "business_id", op: "==", value: normalizedBusinessId },
    { field: "trabalhador_id", op: "==", value: normalizedWorkerId },
    { field: "data_agendamento", op: "==", value: normalizedDateKey },
  ]);

  const existingScheduleRefs = existingDayRows
    .map((row) => String(row?.id ?? "").trim())
    .filter(Boolean)
    .map((id) => db.collection("agendamentos").doc(id));

  await db.runTransaction(async (transaction) => {
    for (const scheduleRef of existingScheduleRefs) {
      const existingSnapshot = await transaction.get(scheduleRef);
      if (!existingSnapshot.exists) continue;

      const existing = existingSnapshot.data() ?? {};
      if (String(existing.business_id ?? "").trim() !== normalizedBusinessId) continue;
      if (Number(existing.trabalhador_id) !== normalizedWorkerId) continue;
      if (isCancelledStatus(existing.status)) continue;

      const existingStart = parseClockToMinute(existing.hora_inicio ?? existing.start_time);
      const existingEnd = parseClockToMinute(existing.hora_fim ?? existing.end_time);
      const existingLocks = Array.isArray(existing.lock_ids) ? existing.lock_ids : [];

      if (existingLocks.some((lockId) => lockRefsById.has(lockId))) {
        throw buildSlotTakenError();
      }

      if (existingStart == null || existingEnd == null || existingEnd <= existingStart) continue;
      if (normalizedSchedules.some((requested) => overlapsMinuteRanges(requested.startMinute, requested.endMinute, existingStart, existingEnd))) {
        throw buildSlotTakenError();
      }
    }

    for (const lockRef of lockRefsById.values()) {
      const lockSnapshot = await transaction.get(lockRef);
      if (lockSnapshot.exists) {
        throw buildSlotTakenError();
      }
    }

    for (const schedule of preparedSchedules) {
      transaction.set(db.collection("agendamentos").doc(String(schedule.id)), schedule);
    }

    for (const [lockId, lockRef] of lockRefsById.entries()) {
      transaction.set(lockRef, {
        id: lockId,
        business_id: normalizedBusinessId,
        trabalhador_id: normalizedWorkerId,
        data_agendamento: normalizedDateKey,
        created_at: new Date(),
      });
    }
  });

  return preparedSchedules;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/bookings/create", async (req, res) => {
  try {
    const {
      businessId,
      workerId,
      customerName,
      customerPhone,
      dateKey,
      schedules = [],
    } = req.body ?? {};

    const normalizedBusinessId = String(businessId ?? "").trim();
    const normalizedWorkerId = Number(workerId);
    const normalizedDateKey = normalizeDateKey(dateKey);
    const cleanCustomerName = String(customerName ?? "").trim();
    const cleanCustomerPhone = String(customerPhone ?? "").trim();

    if (!normalizedBusinessId) {
      return res.status(400).json({ ok: false, message: "businessId ausente." });
    }
    if (!Number.isFinite(normalizedWorkerId) || normalizedWorkerId <= 0) {
      return res.status(400).json({ ok: false, message: "Profissional invalido." });
    }
    if (!normalizedDateKey) {
      return res.status(400).json({ ok: false, message: "Data de agendamento invalida." });
    }
    if (!cleanCustomerName) {
      return res.status(400).json({ ok: false, message: "Nome do cliente e obrigatorio." });
    }
    if (!cleanCustomerPhone) {
      return res.status(400).json({ ok: false, message: "Telefone do cliente e obrigatorio." });
    }

    const businessRow = await readBusinessById(normalizedBusinessId);
    if (!businessRow) {
      return res.status(404).json({ ok: false, message: "Estabelecimento nao encontrado." });
    }

    const limitCheck = await checkScheduleCreationLimit({
      businessId: normalizedBusinessId,
      additionalSchedules: Array.isArray(schedules) ? schedules.length : 1,
      workerId: normalizedWorkerId,
      referenceDate: parseDateOnlyIsoLocal(normalizedDateKey) ?? new Date(),
      businessRow,
    });
    if (limitCheck.allowed !== true) {
      return res.status(409).json({ ok: false, code: "booking/plan-limit", message: limitCheck.message, details: limitCheck });
    }

    const reminderCount = reminderCountForBusinessRow(businessRow);
    const insertedSchedules = await createSchedulesAtomically({
      businessId: normalizedBusinessId,
      workerId: normalizedWorkerId,
      customerName: cleanCustomerName,
      customerPhone: cleanCustomerPhone,
      dateKey: normalizedDateKey,
      reminderCount,
      status: "confirmado",
      schedules,
    });

    const worker = await readWorkerById(normalizedWorkerId);
    const firstSchedule = insertedSchedules[0];
    const firstService = firstSchedule ? await readServiceById(firstSchedule.servico_id) : null;
    const totalPrice = await insertedSchedules.reduce(async (sumPromise, schedule) => {
      const sum = await sumPromise;
      const service = await readServiceById(schedule.servico_id);
      return sum + Number(service?.preco ?? 0);
    }, Promise.resolve(0));

    const blockN8n = shouldBlockN8nForBusinessRow(businessRow);
    const workerName = worker?.nome ?? "Profissional";

    const notificationJobs = insertedSchedules.map(async (inserted) => {
      const service = await readServiceById(inserted.servico_id);
      const scheduleStart = String(inserted?.hora_inicio ?? "").trim();
      const notificationId = generateIntId();

      await db.collection("notifications").doc(String(notificationId)).set({
        id: notificationId,
        business_id: normalizedBusinessId,
        title: `Voce tem um servico de ${service?.nome ?? "servico"} para ${normalizedDateKey}, as ${scheduleStart || "--:--"}!`,
        message: `O cliente ${cleanCustomerName} acabou de agendar um servico. Telefone de contato: ${cleanCustomerPhone}.`,
        trabalhador_nome: workerName,
        type: "agendamento",
        read: false,
        created_at: new Date(),
      });

      if (!blockN8n) {
        await fetch("https://n8n.tock.app.br/webhook/gatilho-agendamento-new", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agendamento: inserted,
            business: businessRow,
          }),
        }).catch(() => null);
      }
    });

    Promise.allSettled(notificationJobs).catch(() => null);

    return res.json({
      ok: true,
      createdIds: insertedSchedules.map((item) => item.id).filter(Boolean),
      insertedSchedules,
      confirmationPayload: {
        schedule: firstSchedule,
        business: businessRow,
        worker: worker ?? {},
        service: firstService ?? {},
        totalPrice,
      },
    });
  } catch (error) {
    const code = String(error?.code ?? "").trim();
    const httpStatus = code === BOOKING_SLOT_TAKEN_CODE || code === BOOKING_SLOT_UNAVAILABLE_CODE ? 409 : 500;
    return res.status(httpStatus).json({
      ok: false,
      code: code || "booking/internal",
      message: error?.message || "Erro interno ao criar agendamento.",
    });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`booking-api listening on :${port}`);
});
