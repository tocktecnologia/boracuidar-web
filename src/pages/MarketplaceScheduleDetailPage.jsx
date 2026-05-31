import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import { auth } from "../lib/firebase-auth";
import { queryRows, shouldBlockN8nForBusinessRow, toJsonSafe, updateRows } from "../lib/firestore";
import { firstText, formatDate, formatMoney, toInt } from "../lib/marketplace";

function readBusinessId(search) {
  const params = new URLSearchParams(search);
  return params.get("businessId")?.trim() ?? params.get("businesId")?.trim() ?? "";
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

export default function MarketplaceScheduleDetailPage() {
  const { agendamentoId } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();

  const routeBusinessId = readBusinessId(search).replace(/\/+$/, "");
  const scheduleId = toInt(agendamentoId);

  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!scheduleId) {
        setError("ID de agendamento invalido.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const scheduleRows = await queryRows({
          table: "agendamentos",
          conditions: [{ field: "id", operator: "eq", value: scheduleId }],
          limit: 1,
        });

        if (scheduleRows.length === 0) {
          throw new Error("Agendamento nao encontrado.");
        }

        const schedule = scheduleRows[0];
        const resolvedBusinessId = String(schedule.business_id ?? "").trim();

        if (routeBusinessId && resolvedBusinessId && routeBusinessId !== resolvedBusinessId) {
          throw new Error("Este agendamento nao pertence ao estabelecimento informado.");
        }

        const [businessRows, workerRows, serviceRows] = await Promise.all([
          queryRows({
            table: "business",
            conditions: [{ field: "id", operator: "eq", value: resolvedBusinessId }],
            limit: 1,
          }),
          queryRows({
            table: "trabalhadores",
            conditions: [
              { field: "business_id", operator: "eq", value: resolvedBusinessId },
              { field: "id", operator: "eq", value: toInt(schedule.trabalhador_id) },
            ],
            limit: 1,
          }),
          queryRows({
            table: "servicos",
            conditions: [
              { field: "business_id", operator: "eq", value: resolvedBusinessId },
              { field: "id", operator: "eq", value: toInt(schedule.servico_id) },
            ],
            limit: 1,
          }),
        ]);

        if (!active) return;

        setPayload({
          schedule,
          business: businessRows[0] ?? {},
          worker: workerRows[0] ?? {},
          service: serviceRows[0] ?? {},
        });
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [routeBusinessId, scheduleId]);

  async function cancelSchedule() {
    if (!payload || canceling) return;

    const currentScheduleId = toInt(payload.schedule?.id);
    const scheduleBusinessId = String(payload.schedule?.business_id ?? "").trim();
    if (!currentScheduleId || !scheduleBusinessId) {
      setError("Agendamento invalido para cancelamento.");
      return;
    }

    const confirmed = window.confirm("Tem certeza que deseja cancelar este agendamento?");
    if (!confirmed) return;

    setCanceling(true);
    setError("");

    try {
      await updateRows({
        table: "agendamentos",
        data: { status: "cancelado" },
        conditions: [{ field: "id", operator: "eq", value: currentScheduleId }],
      });

      const [updatedRows, businessRows] = await Promise.all([
        queryRows({ table: "agendamentos", conditions: [{ field: "id", operator: "eq", value: currentScheduleId }], limit: 1 }),
        queryRows({ table: "business", conditions: [{ field: "id", operator: "eq", value: scheduleBusinessId }], limit: 1 }),
      ]);

      const updatedSchedule = updatedRows[0] ?? { ...payload.schedule, status: "cancelado" };
      const business = businessRows[0] ?? payload.business ?? {};

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
            agendamentoId: String(currentScheduleId),
            business_id: scheduleBusinessId,
            agendamento: toJsonSafe(updatedSchedule),
            business: toJsonSafe(business),
          }),
        });
      }

      setPayload((current) => {
        if (!current) return current;
        return {
          ...current,
          schedule: updatedSchedule,
          business,
        };
      });
    } catch (cancelError) {
      setError(`Erro ao cancelar agendamento: ${cancelError.message}`);
    } finally {
      setCanceling(false);
    }
  }

  const resolvedBusinessId = String(payload?.schedule?.business_id ?? routeBusinessId ?? "").trim();

  return (
    <MarketplaceLayout hideTopbar>
      <section className="schedules-page">
        <article className="surface-block schedule-card schedule-detail-card">
          {loading ? (
            <p className="muted"><Loader2 size={15} className="spin" /> Carregando agendamento...</p>
          ) : null}

          {!loading && error ? (
            <p className="error-text"><AlertTriangle size={14} /> {error}</p>
          ) : null}

          {!loading && !error && payload ? (
            <>
              <div className="schedule-card-head">
                <strong>{payload.service?.nome ?? "Servico"}</strong>
                <span
                  style={{
                    color: statusColor(payload.schedule?.status),
                    borderColor: `${statusColor(payload.schedule?.status)}55`,
                  }}
                >
                  {payload.schedule?.status || "Sem status"}
                </span>
              </div>

              <p>Estabelecimento: {firstText([payload.business?.nome, payload.business?.nome_fantasia]) ?? "Estabelecimento"}</p>
              <p>Profissional: {payload.worker?.nome ?? payload.schedule?.trabalhador_nome ?? "Profissional"}</p>
              <p>Cliente: {payload.schedule?.cliente_nome || "Cliente"}</p>
              <p>Data: {formatDate(payload.schedule?.data_agendamento)}</p>
              <p>Horario: {payload.schedule?.hora_inicio || "--:--"} - {payload.schedule?.hora_fim || "--:--"}</p>
              <p>Valor: {formatMoney(payload.service?.preco || 0)}</p>

              <button
                className="danger-btn"
                type="button"
                disabled={!canCancel(payload.schedule?.status) || canceling}
                onClick={cancelSchedule}
              >
                {canceling ? "Cancelando..." : "Cancelar agendamento"}
              </button>
            </>
          ) : null}
        </article>

        <div className="section-message">
          {resolvedBusinessId ? (
            <button
              className="ghost-btn"
              type="button"
              onClick={() => navigate(`/marketplace/business?businessId=${encodeURIComponent(resolvedBusinessId)}`)}
            >
              Voltar ao estabelecimento
            </button>
          ) : (
            <Link className="ghost-btn" to="/marketplace">Voltar ao marketplace</Link>
          )}
        </div>
      </section>
    </MarketplaceLayout>
  );
}
