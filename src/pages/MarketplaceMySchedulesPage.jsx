import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import PhoneVerificationDialog from "../components/schedules/PhoneVerificationDialog";
import { auth } from "../lib/firebase";
import { queryRows, shouldBlockN8nForBusinessRow, toJsonSafe, updateRows } from "../lib/firestore";
import { digitsOnly, formatDate, firstText, toInt } from "../lib/marketplace";

function useBusinessId() {
  const { search } = useLocation();
  return new URLSearchParams(search).get("businessId")?.trim() ?? "";
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

export default function MarketplaceMySchedulesPage() {
  const businessId = useBusinessId();

  const [phone, setPhone] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [searchedPhone, setSearchedPhone] = useState("");
  const [verifyOpen, setVerifyOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);
  const [error, setError] = useState("");
  const [schedules, setSchedules] = useState([]);

  const [serviceNameById, setServiceNameById] = useState({});
  const [workerNameById, setWorkerNameById] = useState({});

  const phoneDigits = useMemo(() => digitsOnly(phone), [phone]);

  async function loadSchedules(targetDigits) {
    if (!businessId) {
      setError("Business ID ausente.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [scheduleRows, serviceRows, workerRows] = await Promise.all([
        queryRows({
          table: "agendamentos",
          conditions: [
            { field: "business_id", operator: "eq", value: businessId },
            { field: "cliente_telefone", operator: "eq", value: targetDigits },
          ],
          orders: [
            { field: "data_agendamento", ascending: false },
            { field: "hora_inicio", ascending: false },
          ],
        }),
        queryRows({ table: "servicos", conditions: [{ field: "business_id", operator: "eq", value: businessId }] }),
        queryRows({ table: "trabalhadores", conditions: [{ field: "business_id", operator: "eq", value: businessId }] }),
      ]);

      const serviceMap = {};
      serviceRows.forEach((row) => {
        const id = toInt(row.id);
        if (id) serviceMap[id] = row.nome || "Servico";
      });

      const workerMap = {};
      workerRows.forEach((row) => {
        const id = toInt(row.id);
        if (id) workerMap[id] = row.nome || "Profissional";
      });

      setSchedules(scheduleRows);
      setServiceNameById(serviceMap);
      setWorkerNameById(workerMap);
      setSearchedPhone(targetDigits);
    } catch (loadError) {
      setError(`Erro ao buscar agendamentos: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }

  function requestSearch() {
    if (!businessId) {
      setError("Business ID ausente.");
      return;
    }
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

      const [updatedRows, businessRows] = await Promise.all([
        queryRows({ table: "agendamentos", conditions: [{ field: "id", operator: "eq", value: scheduleId }], limit: 1 }),
        queryRows({ table: "business", conditions: [{ field: "id", operator: "eq", value: businessId }], limit: 1 }),
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
            business_id: businessId,
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
        <article className="surface-block">
          <h1>Meus agendamentos</h1>
          <p>Digite seu WhatsApp para consultar e cancelar agendamentos desse estabelecimento.</p>

          <div className="search-row">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+55 (00) 0 0000-0000"
            />
            <button className="cta-btn" onClick={requestSearch} disabled={loading}>
              {loading ? <><Loader2 size={15} className="spin" /> Buscando...</> : <><Search size={15} /> Buscar</>}
            </button>
          </div>

          {error ? <p className="error-text"><AlertTriangle size={14} /> {error}</p> : null}
          {searchedPhone && schedules.length === 0 && !loading ? <p className="muted">Nenhum agendamento encontrado para este numero.</p> : null}
        </article>

        {schedules.map((schedule) => {
          const scheduleId = toInt(schedule.id);
          const serviceId = toInt(schedule.servico_id);
          const workerId = toInt(schedule.trabalhador_id);
          const serviceName = serviceNameById[serviceId] || "Servico";
          const workerName = firstText([schedule.trabalhador_nome, workerNameById[workerId]]) || "Profissional";
          const color = statusColor(schedule.status);

          return (
            <article key={schedule.id ?? `${schedule.data_agendamento}-${schedule.hora_inicio}`} className="surface-block schedule-card">
              <div className="schedule-card-head">
                <strong>{serviceName}</strong>
                <span style={{ color, borderColor: `${color}55` }}>{schedule.status || "Sem status"}</span>
              </div>
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
          <Link className="ghost-btn" to={`/marketplace/business?businessId=${encodeURIComponent(businessId)}`}>Voltar ao estabelecimento</Link>
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
