import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getDocs,
  getFirestore,
  limit as queryLimit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import app from "./firebase";

export const db = getFirestore(app);

const NUMERIC_ID_TABLES = new Set([
  "agendamentos",
  "horarios_excecoes",
  "horarios_padrao",
  "notifications",
  "servicos",
  "trabalhador_servico",
  "trabalhadores",
  "Evaluations",
]);

const STRING_PK_BY_TABLE = {
  business: "id",
  business_type: "type",
  subscriptions: "name",
};

const BOOKING_SLOT_LOCKS_TABLE = "agendamento_slot_locks";
const BOOKING_LOCK_STEP_MINUTES = 5;
export const BOOKING_SLOT_TAKEN_CODE = "booking/slot-taken";
export const BOOKING_SLOT_UNAVAILABLE_CODE = "booking/slot-unavailable";

const DEFAULT_SUBSCRIPTIONS = [
  {
    name: "free",
    label: "Free",
    price: 0,
    max_schedules_month: 100,
    max_pre_reminder: 20,
    max_workers: 1,
    max_products: 0,
    allow_n8n: false,
    block_all_n8n: true,
  },
  {
    name: "basic",
    label: "Basic",
    price: 34.9,
    max_schedules_month: 300,
    max_pre_reminder: 100,
    max_workers: 1,
    max_products: 3,
    allow_n8n: false,
    block_all_n8n: false,
  },
  {
    name: "premium",
    label: "Premium",
    price: 99,
    max_schedules_month: 500,
    max_pre_reminder: 200,
    max_workers: 2,
    max_products: 5,
    allow_n8n: false,
    block_all_n8n: false,
  },
  {
    name: "mega",
    label: "Mega",
    price: 224.9,
    max_schedules_month: 900,
    max_pre_reminder: 900,
    max_workers: 4,
    max_products: 10,
    allow_n8n: true,
    block_all_n8n: false,
  },
];

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "sim";
}

function parseDateOnlyIsoLocal(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function decodeValue(value) {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (Array.isArray(value)) {
    return value.map(decodeValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeValue(v)]));
  }
  return value;
}

function encodeValue(value) {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeValue(v)]));
  }
  return value;
}

function normalizeComparable(value) {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "string") {
    const text = value.trim();
    const dateOnly = parseDateOnlyIsoLocal(text);
    if (dateOnly) return dateOnly;

    const maybeDate = new Date(text);
    if (!Number.isNaN(maybeDate.getTime()) && (text.includes("-") || text.includes("T") || text.includes(":"))) {
      return maybeDate;
    }
  }
  return value;
}

function compareValues(a, b) {
  const left = normalizeComparable(a);
  const right = normalizeComparable(b);

  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;

  if (typeof left === "number" && typeof right === "number") return left - right;
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (typeof left === "boolean" && typeof right === "boolean") return left === right ? 0 : left ? 1 : -1;

  return String(left).localeCompare(String(right));
}

function equalsComparable(a, b) {
  return compareValues(a, b) === 0;
}

function matchCondition(row, condition) {
  const left = row[condition.field];
  const right = condition.value;

  switch (condition.operator) {
    case "eq":
      return equalsComparable(left, right);
    case "neq":
      return !equalsComparable(left, right);
    case "lt":
      return compareValues(left, right) < 0;
    case "lte":
      return compareValues(left, right) <= 0;
    case "gt":
      return compareValues(left, right) > 0;
    case "gte":
      return compareValues(left, right) >= 0;
    case "inFilter":
      return Array.isArray(right) && right.some((item) => equalsComparable(item, left));
    case "contains":
      return Array.isArray(left) && left.some((item) => equalsComparable(item, right));
    case "overlaps": {
      if (!Array.isArray(left) || !Array.isArray(right)) return false;
      return right.some((item) => left.some((leftItem) => equalsComparable(leftItem, item)));
    }
    default:
      return false;
  }
}

function sortAndFilterRows(rows, conditions = [], orders = [], limitCount) {
  let filtered = rows.filter((row) => conditions.every((c) => matchCondition(row, c)));

  if (orders.length > 0) {
    filtered = [...filtered].sort((a, b) => {
      for (const rule of orders) {
        const cmp = compareValues(a[rule.field], b[rule.field]);
        if (cmp !== 0) return rule.ascending === false ? -cmp : cmp;
      }
      return 0;
    });
  }

  if (typeof limitCount === "number" && limitCount >= 0 && filtered.length > limitCount) {
    filtered = filtered.slice(0, limitCount);
  }

  return filtered;
}

function decodeDocRow(table, docSnap) {
  const data = decodeValue(docSnap.data());
  if (NUMERIC_ID_TABLES.has(table) && data.id == null) {
    const parsed = Number.parseInt(docSnap.id, 10);
    if (!Number.isNaN(parsed)) data.id = parsed;
  }
  if (STRING_PK_BY_TABLE[table] && !data[STRING_PK_BY_TABLE[table]]) {
    data[STRING_PK_BY_TABLE[table]] = docSnap.id;
  }
  return data;
}

function queryPartForCondition(c) {
  if (c.operator === "inFilter") {
    const list = Array.isArray(c.value) ? c.value.slice(0, 10) : [];
    if (list.length === 0) return null;
    return where(c.field, "in", list);
  }
  if (c.operator === "contains") return where(c.field, "array-contains", c.value);
  if (c.operator === "overlaps") {
    const list = Array.isArray(c.value) ? c.value.slice(0, 10) : [];
    if (list.length === 0) return null;
    return where(c.field, "array-contains-any", list);
  }

  const op = {
    eq: "==",
    neq: "!=",
    lt: "<",
    lte: "<=",
    gt: ">",
    gte: ">=",
  }[c.operator];

  return op ? where(c.field, op, c.value) : null;
}

function fallbackConditionPriority(condition) {
  const field = String(condition?.field ?? "");
  if (field === "id") return 0;
  if (field === "data_agendamento" || field === "data") return 1;
  if (field === "business_id") return 2;
  if (field === "trabalhador_id" || field === "servico_id") return 3;
  return 4;
}

function generateIntId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
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

export function shouldBlockN8nForBusinessRow(businessRow) {
  const policy = subscriptionPolicyByName(businessRow?.subscription);
  return !toBool(policy.allow_n8n) || toBool(policy.block_all_n8n);
}

export function reminderCountForBusinessRow(businessRow) {
  const policy = subscriptionPolicyByName(businessRow?.subscription);
  return Number(policy.max_pre_reminder) > 0 ? 0 : -1;
}

export async function queryRows({ table, conditions = [], orders = [], limit = null }) {
  const fallback = async () => {
    const fallbackConditions = conditions
      .filter((condition) => ["eq", "inFilter", "contains", "overlaps"].includes(condition.operator))
      .slice()
      .sort((a, b) => fallbackConditionPriority(a) - fallbackConditionPriority(b));

    for (const condition of fallbackConditions) {
      const part = queryPartForCondition(condition);
      if (!part) continue;

      try {
        const snapshot = await getDocs(query(collection(db, table), part));
        const rows = snapshot.docs.map((docSnap) => decodeDocRow(table, docSnap));
        return sortAndFilterRows(rows, conditions, orders, limit);
      } catch {
        // Try the next narrow condition before falling back to a full collection scan.
      }
    }

    const snapshot = await getDocs(collection(db, table));
    const rows = snapshot.docs.map((docSnap) => decodeDocRow(table, docSnap));
    return sortAndFilterRows(rows, conditions, orders, limit);
  };

  try {
    let q = collection(db, table);
    const queryParts = [];

    for (const c of conditions) {
      const part = queryPartForCondition(c);
      if (!part && (c.operator === "inFilter" || c.operator === "overlaps")) return [];
      if (part) queryParts.push(part);
    }

    const canSortAfterFetch =
      typeof limit !== "number" && orders.length > 0 && conditions.length > 0 && conditions.every((c) => c.operator === "eq");

    for (const rule of canSortAfterFetch ? [] : orders) {
      queryParts.push(orderBy(rule.field, rule.ascending === false ? "desc" : "asc"));
    }

    if (typeof limit === "number") {
      queryParts.push(queryLimit(limit));
    }

    const snapshot = await getDocs(query(q, ...queryParts));
    const rows = snapshot.docs.map((docSnap) => decodeDocRow(table, docSnap));

    return sortAndFilterRows(rows, conditions, orders, limit);
  } catch {
    return fallback();
  }
}

export async function queryCollectionGroupRows({ collectionName, conditions = [], orders = [], limit = null }) {
  const fallback = async () => {
    const snapshot = await getDocs(collectionGroup(db, collectionName));
    const rows = snapshot.docs.map((docSnap) => {
      const data = decodeValue(docSnap.data());
      data.id = data.id ?? docSnap.id;
      data.business_id = data.business_id ?? docSnap.ref.parent.parent?.id;
      return data;
    });
    return sortAndFilterRows(rows, conditions, orders, limit);
  };

  try {
    const queryParts = [];
    for (const c of conditions) {
      if (c.operator === "inFilter") {
        const list = Array.isArray(c.value) ? c.value.slice(0, 10) : [];
        if (list.length === 0) return [];
        queryParts.push(where(c.field, "in", list));
      } else if (c.operator === "contains") {
        queryParts.push(where(c.field, "array-contains", c.value));
      } else if (c.operator === "overlaps") {
        const list = Array.isArray(c.value) ? c.value.slice(0, 10) : [];
        if (list.length === 0) return [];
        queryParts.push(where(c.field, "array-contains-any", list));
      } else {
        const op = {
          eq: "==",
          neq: "!=",
          lt: "<",
          lte: "<=",
          gt: ">",
          gte: ">=",
        }[c.operator];
        if (op) queryParts.push(where(c.field, op, c.value));
      }
    }

    for (const rule of orders) {
      queryParts.push(orderBy(rule.field, rule.ascending === false ? "desc" : "asc"));
    }

    if (typeof limit === "number") {
      queryParts.push(queryLimit(limit));
    }

    const snapshot = await getDocs(query(collectionGroup(db, collectionName), ...queryParts));
    const rows = snapshot.docs.map((docSnap) => {
      const data = decodeValue(docSnap.data());
      data.id = data.id ?? docSnap.id;
      data.business_id = data.business_id ?? docSnap.ref.parent.parent?.id;
      return data;
    });

    return sortAndFilterRows(rows, conditions, orders, limit);
  } catch {
    return fallback();
  }
}

function prepareInsertData(table, inputData) {
  const now = new Date();
  const data = { ...inputData };

  if (table === "agendamentos") {
    data.status ??= "agendado";
    data.lembrete_count ??= -1;
    data.cliente_endereco ??= "";
    data.created_at ??= now;
  }

  if (table === "notifications") {
    data.read ??= false;
    data.type ??= "geral";
    data.trabalhador_nome ??= "";
    data.created_at ??= now;
  }

  if (table === "business") {
    data.created_at ??= now;
    data.updated_at ??= now;
    data.subscription ??= "free";
    data.average_stars ??= 0;
    data.reviews_count ??= 0;
  }

  if (table === "trabalhadores") {
    data.ativo ??= true;
    data.created_at ??= now;
    data.average_stars ??= 0;
    data.reviews_count ??= 0;
  }

  if (table === "servicos") {
    data.ativo ??= true;
    data.created_at ??= now;
  }

  if (NUMERIC_ID_TABLES.has(table) && data.id == null) {
    data.id = generateIntId();
  }

  const stringPk = STRING_PK_BY_TABLE[table];
  if (stringPk && !data[stringPk]) {
    data[stringPk] = doc(collection(db, table)).id;
  }

  return data;
}

export async function insertRow({ table, data, docId = null }) {
  const payload = prepareInsertData(table, data);
  const resolvedId = docId ?? String(payload.id ?? payload[STRING_PK_BY_TABLE[table]] ?? doc(collection(db, table)).id);
  const target = doc(db, table, resolvedId);
  await setDoc(target, encodeValue(payload));
  return payload;
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeDateKey(value) {
  const text = String(value ?? "").trim();
  const prefix = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (prefix) return prefix[1];
  const parsed = parseDate(text);
  if (!parsed) return null;
  return formatDateKey(parsed);
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

function lockIdsForScheduleRow(row) {
  if (Array.isArray(row?.lock_ids) && row.lock_ids.length > 0) {
    return row.lock_ids.map((item) => String(item)).filter(Boolean);
  }
  return slotLockIdsForRange({
    businessId: row?.business_id,
    workerId: row?.trabalhador_id,
    dateKey: row?.data_agendamento,
    startTime: row?.hora_inicio ?? row?.start_time,
    endTime: row?.hora_fim ?? row?.end_time,
  });
}

function buildSlotTakenError() {
  const error = new Error("Este horario acabou de ser preenchido por outra pessoa. Escolha outro horario.");
  error.code = BOOKING_SLOT_TAKEN_CODE;
  return error;
}

export function isBookingSlotTakenError(error) {
  return String(error?.code ?? "").trim() === BOOKING_SLOT_TAKEN_CODE;
}

function buildSlotUnavailableError(message = "Esse horario nao cabe na disponibilidade atual do profissional.") {
  const error = new Error(message);
  error.code = BOOKING_SLOT_UNAVAILABLE_CODE;
  return error;
}

export function isBookingSlotUnavailableError(error) {
  return String(error?.code ?? "").trim() === BOOKING_SLOT_UNAVAILABLE_CODE;
}

function overlapsMinuteRanges(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function normalizeExceptionType(value) {
  return String(value ?? "").trim().toLowerCase();
}

function parseMinuteRange(startValue, endValue) {
  const start = parseClockToMinute(startValue);
  const end = parseClockToMinute(endValue);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

async function workerAvailabilityForDay({ businessId, workerId, dateKey }) {
  const targetDate = parseDateOnlyIsoLocal(String(dateKey ?? "").trim());
  if (!targetDate) return null;

  const weekDay = targetDate.getDay();
  const workRows = await queryRows({
    table: "horarios_padrao",
    conditions: [
      { field: "trabalhador_id", operator: "eq", value: workerId },
      { field: "dia_semana", operator: "eq", value: weekDay },
      { field: "business_id", operator: "eq", value: businessId },
      { field: "ativo", operator: "eq", value: true },
    ],
  });

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

  const exceptionRows = await queryRows({
    table: "horarios_excecoes",
    conditions: [
      { field: "trabalhador_id", operator: "eq", value: workerId },
      { field: "data", operator: "eq", value: dateKey },
      { field: "business_id", operator: "eq", value: businessId },
    ],
  });

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

  return {
    workStart,
    workEnd,
    breakStart,
    breakEnd,
    blocked,
  };
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

export async function createSchedulesAtomically({
  businessId,
  workerId,
  customerName,
  customerPhone,
  dateKey,
  reminderCount = -1,
  status = "confirmado",
  schedules = [],
}) {
  const normalizedBusinessId = String(businessId ?? "").trim();
  const normalizedDateKey = normalizeDateKey(dateKey);
  const normalizedWorkerId = Number(workerId);
  const cleanCustomerName = String(customerName ?? "").trim();
  const cleanCustomerPhone = String(customerPhone ?? "").trim();

  if (!normalizedBusinessId) throw new Error("businessId ausente.");
  if (!normalizedDateKey) throw new Error("Data de agendamento invalida.");
  if (!Number.isFinite(normalizedWorkerId) || normalizedWorkerId <= 0) {
    throw new Error("Profissional invalido.");
  }
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

  const preparedSchedules = normalizedSchedules.map((item) => prepareInsertData("agendamentos", {
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
        lockRefsById.set(lockId, doc(db, BOOKING_SLOT_LOCKS_TABLE, lockId));
      }
    }
  }

  const existingDayRows = await queryRows({
    table: "agendamentos",
    conditions: [
      { field: "business_id", operator: "eq", value: normalizedBusinessId },
      { field: "trabalhador_id", operator: "eq", value: normalizedWorkerId },
      { field: "data_agendamento", operator: "eq", value: normalizedDateKey },
    ],
  });

  const existingScheduleRefs = existingDayRows
    .map((row) => String(row?.id ?? "").trim())
    .filter(Boolean)
    .map((id) => doc(db, "agendamentos", id));

  await runTransaction(db, async (transaction) => {
    for (const scheduleRef of existingScheduleRefs) {
      const existingSnapshot = await transaction.get(scheduleRef);
      if (!existingSnapshot.exists()) continue;

      const existing = decodeDocRow("agendamentos", existingSnapshot);
      if (String(existing.business_id ?? "").trim() !== normalizedBusinessId) continue;
      if (Number(existing.trabalhador_id) !== normalizedWorkerId) continue;
      if (isCancelledStatus(existing.status)) continue;

      const existingStart = parseClockToMinute(existing.hora_inicio ?? existing.start_time);
      const existingEnd = parseClockToMinute(existing.hora_fim ?? existing.end_time);
      const existingLocks = lockIdsForScheduleRow(existing);

      if (existingLocks.some((lockId) => lockRefsById.has(lockId))) {
        throw buildSlotTakenError();
      }

      if (existingStart == null || existingEnd == null || existingEnd <= existingStart) continue;
      if (
        normalizedSchedules.some((requested) =>
          overlapsMinuteRanges(requested.startMinute, requested.endMinute, existingStart, existingEnd),
        )
      ) {
        throw buildSlotTakenError();
      }
    }

    for (const lockRef of lockRefsById.values()) {
      const lockSnapshot = await transaction.get(lockRef);
      if (lockSnapshot.exists()) {
        throw buildSlotTakenError();
      }
    }

    for (const schedule of preparedSchedules) {
      const scheduleDocId = String(schedule.id);
      transaction.set(doc(db, "agendamentos", scheduleDocId), encodeValue(schedule));
    }

    for (const [lockId, lockRef] of lockRefsById.entries()) {
      transaction.set(lockRef, encodeValue({
        id: lockId,
        business_id: normalizedBusinessId,
        trabalhador_id: normalizedWorkerId,
        data_agendamento: normalizedDateKey,
        created_at: new Date(),
      }));
    }
  });

  return preparedSchedules;
}

async function releaseScheduleLocksForRows(rows) {
  const lockIds = new Set();
  for (const row of rows) {
    for (const lockId of lockIdsForScheduleRow(row)) {
      lockIds.add(lockId);
    }
  }
  if (lockIds.size === 0) return;

  const lockIdList = Array.from(lockIds);
  for (let index = 0; index < lockIdList.length; index += 450) {
    const chunk = lockIdList.slice(index, index + 450);
    const batch = writeBatch(db);
    for (const lockId of chunk) {
      batch.delete(doc(db, BOOKING_SLOT_LOCKS_TABLE, lockId));
    }
    await batch.commit();
  }
}

export async function updateRows({ table, data, conditions = [] }) {
  const targets = await queryRows({ table, conditions });
  if (targets.length === 0) return [];

  const snapshot = await getDocs(collection(db, table));
  const updateData = encodeValue({ ...data, ...(table === "business" ? { updated_at: new Date() } : {}) });
  const batch = writeBatch(db);

  for (const docSnap of snapshot.docs) {
    const decoded = decodeValue(docSnap.data());
    if (!conditions.every((c) => matchCondition(decoded, c))) continue;
    batch.update(docSnap.ref, updateData);
  }

  await batch.commit();
  if (table === "agendamentos" && isCancelledStatus(data?.status)) {
    await releaseScheduleLocksForRows(targets);
  }
  return targets;
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

function isCancelledStatus(status) {
  const text = String(status ?? "").trim().toLowerCase();
  return text === "cancelado" || text === "canceled" || text === "cancelled";
}

export async function checkScheduleCreationLimit({ businessId, additionalSchedules = 1, workerId = null, referenceDate = new Date(), businessRow = null }) {
  const rows = await queryRows({
    table: "agendamentos",
    conditions: [{ field: "business_id", operator: "eq", value: businessId }],
  });

  const resolvedBusiness = businessRow ?? (await queryRows({
    table: "business",
    conditions: [{ field: "id", operator: "eq", value: businessId }],
    limit: 1,
  }))[0] ?? {};

  const policy = subscriptionPolicyByName(resolvedBusiness.subscription);
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);

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
      limit_type: "business_monthly",
      current: inMonth.length,
      limit: monthlyLimit,
      plan: policy.name,
      message: `Limite do plano ${policy.label} atingido: ${monthlyLimit} agendamentos por mes.`,
    };
  }

  return { allowed: true, policy, plan: policy.name };
}

export async function createEvaluation({ businessId, workerId, stars, comment = null, authorName = null, authorEmail = null, authorUid = null, workerName = null }) {
  const now = new Date();

  const workers = await queryRows({
    table: "trabalhadores",
    conditions: [
      { field: "business_id", operator: "eq", value: businessId },
      { field: "id", operator: "eq", value: workerId },
    ],
    limit: 1,
  });

  if (workers.length === 0) {
    throw new Error("Profissional nao encontrado para este estabelecimento.");
  }

  const evaluation = await insertRow({
    table: "Evaluations",
    data: {
      business_id: businessId,
      trabalhador_id: Number(workerId),
      worker_id: Number(workerId),
      trabalhador_nome: workerName ?? workers[0].nome ?? "Profissional",
      worker_name: workerName ?? workers[0].nome ?? "Profissional",
      stars: Number(stars),
      comment: comment ?? "",
      comentario: comment ?? "",
      name: authorName ?? "",
      email: authorEmail ?? "",
      user_uid: authorUid ?? "",
      created_at: now,
      updated_at: now,
    },
  });

  await recalculateWorkerAverageStars({ businessId, workerId: Number(workerId) });
  await recalculateBusinessAverageStars({ businessId });

  return evaluation;
}

export async function recalculateWorkerAverageStars({ businessId, workerId }) {
  const evaluations = await queryRows({
    table: "Evaluations",
    conditions: [
      { field: "business_id", operator: "eq", value: businessId },
      { field: "trabalhador_id", operator: "eq", value: workerId },
    ],
  });

  const stars = evaluations
    .map((row) => Number(row.stars))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);

  const reviewsCount = stars.length;
  const average = reviewsCount === 0 ? 0 : stars.reduce((acc, value) => acc + value, 0) / reviewsCount;

  await updateRows({
    table: "trabalhadores",
    data: {
      average_stars: average,
      reviews_count: reviewsCount,
    },
    conditions: [
      { field: "business_id", operator: "eq", value: businessId },
      { field: "id", operator: "eq", value: workerId },
    ],
  });

  return { average_stars: average, reviews_count: reviewsCount };
}

export async function recalculateBusinessAverageStars({ businessId }) {
  const workers = await queryRows({
    table: "trabalhadores",
    conditions: [{ field: "business_id", operator: "eq", value: businessId }],
  });

  const stats = workers
    .map((row) => ({
      average: Number(row.average_stars ?? 0),
      reviews: Number(row.reviews_count ?? 0),
    }))
    .filter((row) => row.reviews > 0);

  const reviewsCount = stats.reduce((acc, row) => acc + row.reviews, 0);
  const average = stats.length === 0 ? 0 : stats.reduce((acc, row) => acc + row.average, 0) / stats.length;

  await updateRows({
    table: "business",
    data: {
      average_stars: average,
      reviews_count: reviewsCount,
    },
    conditions: [{ field: "id", operator: "eq", value: businessId }],
  });

  return { average_stars: average, reviews_count: reviewsCount };
}

export function toJsonSafe(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJsonSafe(v)]));
  }
  return value;
}
