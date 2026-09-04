import { useState } from "react";
import { AlertTriangle, Loader2, Search, X } from "lucide-react";
import Modal from "../common/Modal";
import { auth } from "../../lib/firebase-auth";
import { queryRows, shouldBlockN8nForBusinessRow, toJsonSafe, updateRows } from "../../lib/firestore";
import { digitsOnly, firstText, formatDate, toInt } from "../../lib/marketplace";

function isCancelable(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return ["agendado", "confirmado", "scheduled", "confirmed"].includes(normalized);
}

function statusColor(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (["cancelado", "cancelled", "canceled"].includes(normalized)) return "#b42318";
  if (["finalizado", "completed"].includes(normalized)) return "#64748b";
  return "#0e9c97";
}

function byScheduledDate(left, right) {
  const leftDate = new Date(`${left?.data_agendamento ?? ""}T${left?.hora_inicio ?? "00:00"}`);
  const rightDate = new Date(`${right?.data_agendamento ?? ""}T${right?.hora_inicio ?? "00:00"}`);
  return rightDate.getTime() - leftDate.getTime();
}

function localWhatsappDigits(value) {
  const raw = digitsOnly(value);
  // Accept pasted numbers with +55, but never require the customer to type it.
  return raw.length >= 12 && raw.startsWith("55") ? raw.slice(2, 13) : raw.slice(0, 11);
}

function formatLocalWhatsapp(value) {
  const digits = localWhatsappDigits(value);
  if (!digits) return "";

  const area = digits.slice(0, 2);
  const number = digits.slice(2);
  let formatted = area ? `(${area}` : "";
  if (area.length === 2) formatted += ") ";

  if (number.length <= 5) return `${formatted}${number}`;
  const firstBlock = number.slice(0, 5);
  const lastBlock = number.slice(5);
  return `${formatted}${firstBlock}${lastBlock ? `-${lastBlock}` : ""}`;
}

export default function BusinessSchedulesDialog({ isOpen, onClose, businessId, businessName }) {
  const [phone, setPhone] = useState("");
  const [searchedPhone, setSearchedPhone] = useState("");
  const [schedules, setSchedules] = useState([]);
  const [serviceNames, setServiceNames] = useState({});
  const [workerNames, setWorkerNames] = useState({});
  const [loading, setLoading] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);
  const [error, setError] = useState("");

  const phoneDigits = localWhatsappDigits(phone);
  const showingResults = Boolean(searchedPhone);

  async function loadSchedules(targetPhone) {
    setLoading(true);
    setError("");

    try {
      const [scheduleRows, serviceRows, workerRows] = await Promise.all([
        queryRows({
          table: "agendamentos",
          conditions: [
            { field: "business_id", operator: "eq", value: businessId },
            { field: "cliente_telefone", operator: "eq", value: targetPhone },
          ],
          limit: 300,
        }),
        queryRows({
          table: "servicos",
          conditions: [{ field: "business_id", operator: "eq", value: businessId }],
        }),
        queryRows({
          table: "trabalhadores",
          conditions: [{ field: "business_id", operator: "eq", value: businessId }],
        }),
      ]);

      setSchedules([...scheduleRows].sort(byScheduledDate));
      setServiceNames(Object.fromEntries(serviceRows.map((row) => [String(row.id), row.nome || "Servico"])));
      setWorkerNames(Object.fromEntries(workerRows.map((row) => [String(row.id), row.nome || "Profissional"])));
      setSearchedPhone(targetPhone);
    } catch (loadError) {
      setError(`Nao foi possivel buscar os agendamentos: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }

  function search() {
    if (phoneDigits.length !== 11) {
      setError("Informe o DDD e os nove digitos do WhatsApp usado no agendamento.");
      return;
    }
    loadSchedules(`55${phoneDigits}`);
  }

  async function cancelSchedule(schedule) {
    const scheduleId = toInt(schedule.id);
    if (scheduleId == null) {
      setError("Agendamento invalido.");
      return;
    }
    if (!window.confirm("Deseja cancelar este agendamento?")) return;

    setCancelingId(scheduleId);
    setError("");
    try {
      await updateRows({
        table: "agendamentos",
        data: { status: "cancelado" },
        conditions: [
          { field: "id", operator: "eq", value: scheduleId },
          { field: "business_id", operator: "eq", value: businessId },
          { field: "cliente_telefone", operator: "eq", value: searchedPhone },
        ],
      });

      const [updatedRows, businessRows] = await Promise.all([
        queryRows({
          table: "agendamentos",
          conditions: [{ field: "id", operator: "eq", value: scheduleId }],
          limit: 1,
        }),
        queryRows({
          table: "business",
          conditions: [{ field: "id", operator: "eq", value: businessId }],
          limit: 1,
        }),
      ]);
      const updatedSchedule = updatedRows[0] ?? { ...schedule, status: "cancelado" };
      const business = businessRows[0] ?? {};

      if (!shouldBlockN8nForBusinessRow(business)) {
        const headers = { "Content-Type": "application/json" };
        try {
          const token = await auth.currentUser?.getIdToken(false);
          if (token) headers.Authorization = `Bearer ${token}`;
        } catch {
          // The cancellation itself does not require authentication.
        }

        await fetch("https://n8n.tock.app.br/webhook/gatilho-cancelamento-new", {
          method: "POST",
          headers,
          body: JSON.stringify({
            agendamentoId: String(scheduleId),
            business_id: businessId,
            agendamento: toJsonSafe(updatedSchedule),
            business: toJsonSafe(business),
          }),
        });
      }
      await loadSchedules(searchedPhone);
    } catch (cancelError) {
      setError(`Nao foi possivel cancelar o agendamento: ${cancelError.message}`);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => !loading && !cancelingId && onClose?.()} maxWidth={680}>
      <div className="business-schedules-dialog">
        <header className="dialog-head business-schedules-head">
          <div>
            <h3>{showingResults ? "Seus agendamentos" : "Meus agendamentos"}</h3>
            <p>{businessName ? `Consulte os agendamentos em ${businessName}.` : "Consulte seus agendamentos."}</p>
          </div>
          <button className="business-schedules-close" onClick={onClose} disabled={loading || cancelingId != null} aria-label="Fechar" type="button">
            <X size={19} />
          </button>
        </header>

        {!showingResults ? (
          <div className="business-schedules-phone-step">
            <label htmlFor="business-schedules-phone">WhatsApp usado no agendamento</label>
            <div className="business-schedules-phone-input">
              <span aria-hidden="true">+55</span>
              <input
                id="business-schedules-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(event) => setPhone(formatLocalWhatsapp(event.target.value))}
                onKeyDown={(event) => event.key === "Enter" && search()}
                placeholder="(00) 00000-0000"
                maxLength={16}
                disabled={loading}
              />
            </div>
            <p className="muted">Usaremos esse numero apenas para localizar os seus agendamentos neste estabelecimento.</p>
            {error ? <p className="error-text"><AlertTriangle size={14} /> {error}</p> : null}
            <div className="dialog-foot">
              <button className="ghost-btn" onClick={onClose} disabled={loading} type="button">Cancelar</button>
              <button className="cta-btn" onClick={search} disabled={loading} type="button">
                {loading ? <><Loader2 size={16} className="spin" /> Buscando...</> : <><Search size={16} /> OK</>}
              </button>
            </div>
          </div>
        ) : (
          <div className="business-schedules-results">
            <div className="business-schedules-phone-summary">
              <span>WhatsApp: +55 {formatLocalWhatsapp(searchedPhone.slice(2))}</span>
              <button className="ghost-btn" onClick={() => setSearchedPhone("")} disabled={loading || cancelingId != null} type="button">Alterar numero</button>
            </div>

            {loading ? <p className="dialog-loading"><Loader2 size={17} className="spin" /> Atualizando agendamentos...</p> : null}
            {error ? <p className="error-text"><AlertTriangle size={14} /> {error}</p> : null}
            {!loading && schedules.length === 0 ? <p className="muted">Nenhum agendamento foi encontrado para esse WhatsApp.</p> : null}

            <div className="business-schedules-list">
              {schedules.map((schedule) => {
                const scheduleId = toInt(schedule.id);
                const serviceName = serviceNames[String(schedule.servico_id)] || firstText([schedule.servico_nome, schedule.servico]) || "Servico";
                const workerName = workerNames[String(schedule.trabalhador_id)] || firstText([schedule.trabalhador_nome, schedule.trabalhador]) || "Profissional";
                const color = statusColor(schedule.status);

                return (
                  <article className="business-schedule-row" key={schedule.id ?? `${schedule.data_agendamento}-${schedule.hora_inicio}`}>
                    <div className="business-schedule-row-head">
                      <strong>{serviceName}</strong>
                      <span style={{ color, borderColor: `${color}55` }}>{schedule.status || "Agendado"}</span>
                    </div>
                    <p>{formatDate(schedule.data_agendamento)} · {schedule.hora_inicio || "--:--"}{schedule.hora_fim ? ` – ${schedule.hora_fim}` : ""}</p>
                    <p>Profissional: {workerName}</p>
                    {isCancelable(schedule.status) ? (
                      <button className="danger-btn" onClick={() => cancelSchedule(schedule)} disabled={cancelingId === scheduleId || loading} type="button">
                        {cancelingId === scheduleId ? "Cancelando..." : "Cancelar agendamento"}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
