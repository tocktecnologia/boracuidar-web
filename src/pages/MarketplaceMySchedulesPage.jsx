import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import PhoneVerificationDialog from "../components/schedules/PhoneVerificationDialog";
import { auth } from "../lib/firebase-auth";
import { queryRows, shouldBlockN8nForBusinessRow, toJsonSafe, updateRows } from "../lib/firestore";
import { asDateOnly, digitsOnly, formatDate, firstText, parseDate, parseTimeOnDate, toInt } from "../lib/marketplace";

function readQueryParam(search, keys) {
  const source = String(search ?? "");
  const candidates = Array.isArray(keys) ? keys : [keys];

  for (const key of candidates) {
    const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?:\\?|&)${escapedKey}=([^&?]*)`, "i").exec(source);
    if (!match) continue;
    const value = decodeURIComponent(String(match[1] ?? "").replace(/\+/g, " ")).trim();
    if (value) return value;
  }

  return "";
}

function useRouteQueryState() {
  const { search } = useLocation();
  const businessIdRaw = readQueryParam(search, ["businessId", "businesId"]);
  const businessId = businessIdRaw.replace(/\/+$/, "");
  const whatsapp = readQueryParam(search, ["whatsapp", "whatsap"]);
  return { businessId, whatsapp };
}

function statusColor(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "cancelado" || normalized === "cancelled" || normalized === "canceled") return "#ef4444";
  if (normalized === "finalizado" || normalized === "completed") return "#64748b";
  if (["confirmado", "agendado", "confirmed", "scheduled"].includes(normalized)) return "#0e9c97";
  return "#475467";
}

function canCancel(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (["cancelado", "cancelled", "canceled", "finalizado", "completed"].includes(normalized)) return false;
  return ["confirmado", "agendado", "confirmed", "scheduled"].includes(normalized);
}

function scheduleDateKey(value) {
  if (!value) return null;
  if (value instanceof Date) return asDateOnly(value);

  const text = String(value).trim();
  const brDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (brDate) {
    return new Date(Number(brDate[3]), Number(brDate[2]) - 1, Number(brDate[1]));
  }
  const datePrefix = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (datePrefix) {
    return new Date(Number(datePrefix[1]), Number(datePrefix[2]) - 1, Number(datePrefix[3]));
  }

  const parsed = parseDate(text);
  return parsed ? asDateOnly(parsed) : null;
}

function scheduleStartAt(row) {
  const date = scheduleDateKey(row?.data_agendamento);
  if (!date) return null;

  const start = parseTimeOnDate(date, row?.hora_inicio);
  if (start) return start;

  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
}

function chunkArray(values, size = 10) {
  const list = Array.isArray(values) ? values : [];
  const output = [];
  for (let index = 0; index < list.length; index += size) {
    output.push(list.slice(index, index + size));
  }
  return output;
}

function dateKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function queryByBusinessAndIds({ table, businessId, ids }) {
  const normalizedBusinessId = String(businessId ?? "").trim();
  if (!normalizedBusinessId || !Array.isArray(ids) || ids.length === 0) return [];

  const chunks = chunkArray(Array.from(new Set(ids)), 10);
  const rows = await Promise.all(
    chunks.map((chunk) =>
      queryRows({
        table,
        conditions: [
          { field: "business_id", operator: "eq", value: normalizedBusinessId },
          { field: "id", operator: "inFilter", value: chunk },
        ],
      }),
    ),
  );
  return rows.flat();
}

export default function MarketplaceMySchedulesPage() {
  const { businessId, whatsapp: whatsappFromUrl } = useRouteQueryState();
  const hasBusinessScope = Boolean(businessId);

  const [phone, setPhone] = useState(() => whatsappFromUrl || "");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [searchedPhone, setSearchedPhone] = useState("");
  const [verifyOpen, setVerifyOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [cancelingId, setCancelingId] = useState(null);
  const [error, setError] = useState("");
  const [schedules, setSchedules] = useState([]);

  const [serviceNameById, setServiceNameById] = useState({});
  const [workerNameById, setWorkerNameById] = useState({});
  const [businessNameById, setBusinessNameById] = useState({});
  const [scopedBusinessLogo, setScopedBusinessLogo] = useState("");
  const [scopedBusinessName, setScopedBusinessName] = useState("");

  const phoneDigits = useMemo(() => digitsOnly(phone), [phone]);

  function scopedKey(scopeBusinessId, id) {
    return `${String(scopeBusinessId ?? "").trim()}::${String(id ?? "").trim()}`;
  }

  useEffect(() => {
    let active = true;

    async function loadScopedBusinessIdentity() {
      if (!hasBusinessScope || !businessId) {
        if (!active) return;
        setScopedBusinessLogo("");
        setScopedBusinessName("");
        return;
      }

      try {
        const rows = await queryRows({
          table: "business",
          conditions: [{ field: "id", operator: "eq", value: businessId }],
          limit: 1,
        });

        if (!active) return;
        const row = rows[0] ?? {};

        setScopedBusinessName(firstText([row.nome, row.nome_fantasia]) ?? "Estabelecimento");
        setScopedBusinessLogo(
          firstText([
            row.logo_url,
            row.logo,
            row.foto_url,
            row.photo_url,
            row.cover_photo_url,
          ]) ?? "",
        );
      } catch {
        if (!active) return;
        setScopedBusinessLogo("");
        setScopedBusinessName("");
      }
    }

    loadScopedBusinessIdentity();

    return () => {
      active = false;
    };
  }, [businessId, hasBusinessScope]);

  async function loadSchedules(targetDigits) {
    setLoading(true);
    setLoadingLabel("Filtrando agendamentos a partir de agora...");
    setError("");

    try {
      const now = new Date();
      const todayKey = dateKeyFromDate(now);

      const scheduleConditions = [
        { field: "cliente_telefone", operator: "eq", value: targetDigits },
        { field: "data_agendamento", operator: "gte", value: todayKey },
      ];
      if (hasBusinessScope) {
        scheduleConditions.unshift({ field: "business_id", operator: "eq", value: businessId });
      }

      const scheduleRowsRaw = await queryRows({
        table: "agendamentos",
        conditions: scheduleConditions,
        limit: hasBusinessScope ? 300 : 500,
      });

      setLoadingLabel("Validando horarios e removendo agendamentos passados...");
      const scheduleRows = scheduleRowsRaw.filter((row) => {
        const startAt = scheduleStartAt(row);
        return startAt && startAt.getTime() > now.getTime();
      }).sort((a, b) => {
        const aStart = scheduleStartAt(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bStart = scheduleStartAt(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aStart - bStart;
      });

      const uniqueBusinessIds = Array.from(
        new Set(
          scheduleRows
            .map((row) => String(row.business_id ?? "").trim())
            .filter(Boolean),
        ),
      );

      let serviceRows = [];
      let workerRows = [];
      let businessRows = [];

      setLoadingLabel("Carregando detalhes dos servicos e profissionais...");
      if (hasBusinessScope) {
        const serviceIds = Array.from(
          new Set(
            scheduleRows
              .map((row) => toInt(row.servico_id))
              .filter((id) => id != null),
          ),
        );
        const workerIds = Array.from(
          new Set(
            scheduleRows
              .map((row) => toInt(row.trabalhador_id))
              .filter((id) => id != null),
          ),
        );

        [serviceRows, workerRows] = await Promise.all([
          queryByBusinessAndIds({ table: "servicos", businessId, ids: serviceIds }),
          queryByBusinessAndIds({ table: "trabalhadores", businessId, ids: workerIds }),
        ]);
      } else if (uniqueBusinessIds.length > 0) {
        const perBusinessRows = await Promise.all(
          uniqueBusinessIds.map(async (currentBusinessId) => {
            const rowsForBusiness = scheduleRows.filter((row) => String(row.business_id ?? "").trim() === currentBusinessId);
            const serviceIds = Array.from(
              new Set(
                rowsForBusiness
                  .map((row) => toInt(row.servico_id))
                  .filter((id) => id != null),
              ),
            );
            const workerIds = Array.from(
              new Set(
                rowsForBusiness
                  .map((row) => toInt(row.trabalhador_id))
                  .filter((id) => id != null),
              ),
            );

            const [servicesForBusiness, workersForBusiness, businessForBusiness] = await Promise.all([
              queryByBusinessAndIds({ table: "servicos", businessId: currentBusinessId, ids: serviceIds }),
              queryByBusinessAndIds({ table: "trabalhadores", businessId: currentBusinessId, ids: workerIds }),
              queryRows({ table: "business", conditions: [{ field: "id", operator: "eq", value: currentBusinessId }], limit: 1 }),
            ]);
            return {
              servicesForBusiness,
              workersForBusiness,
              businessForBusiness,
            };
          }),
        );

        serviceRows = perBusinessRows.flatMap((item) => item.servicesForBusiness);
        workerRows = perBusinessRows.flatMap((item) => item.workersForBusiness);
        businessRows = perBusinessRows.flatMap((item) => item.businessForBusiness);
      }

      setLoadingLabel("Finalizando busca...");
      const serviceMap = {};
      serviceRows.forEach((row) => {
        const id = toInt(row.id);
        const scopeId = String(row.business_id ?? "").trim();
        if (id != null && scopeId) {
          serviceMap[scopedKey(scopeId, id)] = row.nome || "Servico";
        }
      });

      const workerMap = {};
      workerRows.forEach((row) => {
        const id = toInt(row.id);
        const scopeId = String(row.business_id ?? "").trim();
        if (id != null && scopeId) {
          workerMap[scopedKey(scopeId, id)] = row.nome || "Profissional";
        }
      });

      const businessMap = {};
      businessRows.forEach((row) => {
        const id = String(row.id ?? "").trim();
        if (id) businessMap[id] = row.nome || "Estabelecimento";
      });

      setSchedules(scheduleRows);
      setServiceNameById(serviceMap);
      setWorkerNameById(workerMap);
      setBusinessNameById(businessMap);
      setSearchedPhone(targetDigits);
    } catch (loadError) {
      setError(`Erro ao buscar agendamentos: ${loadError.message}`);
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }

  function requestSearch() {
    if (phoneDigits.length < 10) {
      setError("Informe um numero valido.");
      return;
    }

    if (phoneDigits === verifiedPhone) {
      loadSchedules(phoneDigits);
      return;
    }

    setVerifyOpen(true);
  }

  async function cancelSchedule(schedule) {
    const scheduleId = toInt(schedule.id);
    if (!scheduleId) {
      setError("Agendamento invalido.");
      return;
    }

    const confirmed = window.confirm("Tem certeza que deseja cancelar este agendamento?");
    if (!confirmed) return;

    setCancelingId(scheduleId);
    setError("");

    try {
      await updateRows({
        table: "agendamentos",
        data: { status: "cancelado" },
        conditions: [{ field: "id", operator: "eq", value: scheduleId }],
      });

      const scheduleBusinessId = String(schedule.business_id ?? businessId ?? "").trim();
      const [updatedRows, businessRows] = await Promise.all([
        queryRows({ table: "agendamentos", conditions: [{ field: "id", operator: "eq", value: scheduleId }], limit: 1 }),
        queryRows({ table: "business", conditions: [{ field: "id", operator: "eq", value: scheduleBusinessId }], limit: 1 }),
      ]);

      const updated = updatedRows[0] ?? { ...schedule, status: "cancelado" };
      const business = businessRows[0] ?? {};

      if (!shouldBlockN8nForBusinessRow(business)) {
        const headers = { "Content-Type": "application/json" };
        try {
          const token = await auth.currentUser?.getIdToken(false);
          if (token) headers.Authorization = `Bearer ${token}`;
        } catch {
          // optional auth token
        }

        await fetch("https://n8n.tock.app.br/webhook/gatilho-cancelamento-new", {
          method: "POST",
          headers,
          body: JSON.stringify({
            agendamentoId: String(scheduleId),
            business_id: scheduleBusinessId,
            agendamento: toJsonSafe(updated),
            business: toJsonSafe(business),
          }),
        });
      }

      await loadSchedules(searchedPhone || phoneDigits);
    } catch (cancelError) {
      setError(`Erro ao cancelar agendamento: ${cancelError.message}`);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <MarketplaceLayout hideTopbar>
      <section className="schedules-page">
        <article className="surface-block schedules-search-block">
          <div className="schedules-search-head">
            {hasBusinessScope && scopedBusinessLogo ? (
              <div className="schedules-business-logo" aria-hidden="true">
                <img src={scopedBusinessLogo} alt={scopedBusinessName || "Logo do estabelecimento"} loading="lazy" />
              </div>
            ) : null}
            <div>
              <h1>Meus agendamentos</h1>
              <p>
                Digite seu WhatsApp para consultar e cancelar agendamentos
                {hasBusinessScope ? " desse estabelecimento." : " em todos os estabelecimentos."}
              </p>
            </div>
          </div>

          <div className="search-row">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+55 (00) 0 0000-0000"
            />
            <button className="cta-btn" onClick={requestSearch} disabled={loading}>
              {loading ? <><Loader2 size={15} className="spin" /> {loadingLabel || "Buscando..."}</> : <><Search size={15} /> Buscar</>}
            </button>
          </div>

          {loading ? <p className="muted">Etapa atual: {loadingLabel || "Preparando busca..."}</p> : null}
          {error ? <p className="error-text"><AlertTriangle size={14} /> {error}</p> : null}
          {searchedPhone && schedules.length === 0 && !loading ? <p className="muted">Nenhum agendamento encontrado para este numero.</p> : null}
        </article>

        {schedules.map((schedule) => {
          const scheduleBusinessId = String(schedule.business_id ?? "").trim();
          const businessName = businessNameById[scheduleBusinessId] || "Estabelecimento";
          const scheduleId = toInt(schedule.id);
          const serviceId = toInt(schedule.servico_id);
          const workerId = toInt(schedule.trabalhador_id);
          const serviceName = serviceNameById[scopedKey(scheduleBusinessId, serviceId)] || "Servico";
          const workerName = firstText([schedule.trabalhador_nome, workerNameById[scopedKey(scheduleBusinessId, workerId)]]) || "Profissional";
          const color = statusColor(schedule.status);

          return (
            <article key={schedule.id ?? `${schedule.data_agendamento}-${schedule.hora_inicio}`} className="surface-block schedule-card">
              <div className="schedule-card-head">
                <strong>{serviceName}</strong>
                <span style={{ color, borderColor: `${color}55` }}>{schedule.status || "Sem status"}</span>
              </div>
              {!hasBusinessScope ? <p>Estabelecimento: {businessName}</p> : null}
              <p>Profissional: {workerName}</p>
              <p>Data: {formatDate(schedule.data_agendamento)}</p>
              <p>Horario: {schedule.hora_inicio || "--:--"} - {schedule.hora_fim || "--:--"}</p>

              <button
                className="danger-btn"
                disabled={!canCancel(schedule.status) || cancelingId === scheduleId}
                onClick={() => cancelSchedule(schedule)}
              >
                {cancelingId === scheduleId ? "Cancelando..." : "Cancelar agendamento"}
              </button>
            </article>
          );
        })}

        <div className="section-message">
          {hasBusinessScope ? (
            <Link className="ghost-btn" to={`/marketplace/business?businessId=${encodeURIComponent(businessId)}`}>
              Voltar ao estabelecimento
            </Link>
          ) : (
            <Link className="ghost-btn" to="/marketplace">Voltar ao marketplace</Link>
          )}
        </div>
      </section>

      <PhoneVerificationDialog
        isOpen={verifyOpen}
        phoneDigits={phoneDigits}
        onCancel={() => setVerifyOpen(false)}
        onSuccess={() => {
          setVerifiedPhone(phoneDigits);
          setVerifyOpen(false);
          loadSchedules(phoneDigits);
        }}
      />
    </MarketplaceLayout>
  );
}
