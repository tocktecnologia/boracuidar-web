import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getDocs,
  limit as queryLimit,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

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
    const snapshot = await getDocs(collection(db, table));
    const rows = snapshot.docs.map((docSnap) => {
      const data = decodeValue(docSnap.data());
      if (NUMERIC_ID_TABLES.has(table) && data.id == null) {
        const parsed = Number.parseInt(docSnap.id, 10);
        if (!Number.isNaN(parsed)) data.id = parsed;
      }
      if (STRING_PK_BY_TABLE[table] && !data[STRING_PK_BY_TABLE[table]]) {
        data[STRING_PK_BY_TABLE[table]] = docSnap.id;
      }
      return data;
    });
    return sortAndFilterRows(rows, conditions, orders, limit);
  };

  try {
    let q = collection(db, table);
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

    const snapshot = await getDocs(query(q, ...queryParts));
    const rows = snapshot.docs.map((docSnap) => {
      const data = decodeValue(docSnap.data());
      if (NUMERIC_ID_TABLES.has(table) && data.id == null) {
        const parsed = Number.parseInt(docSnap.id, 10);
        if (!Number.isNaN(parsed)) data.id = parsed;
      }
      if (STRING_PK_BY_TABLE[table] && !data[STRING_PK_BY_TABLE[table]]) {
        data[STRING_PK_BY_TABLE[table]] = docSnap.id;
      }
      return data;
    });

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
