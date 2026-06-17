import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { queryRows } from "../../lib/firestore";
import { digitsOnly, firstText, formatDate, formatMoney } from "../../lib/marketplace";
import { measureAsync } from "../../lib/observability";

function buildInitialPayload(agendamentoId, initialPayload) {
  if (!initialPayload) return null;
  const payloadId = Number(initialPayload?.schedule?.id ?? 0);
  if (!payloadId || payloadId !== Number(agendamentoId)) return null;
  return initialPayload;
}

export default function BookingConfirmationCard({ agendamentoId, onBack, initialPayload = null }) {
  const initialResolvedPayload = buildInitialPayload(agendamentoId, initialPayload);
  const [loading, setLoading] = useState(Boolean(agendamentoId) && !initialResolvedPayload);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(initialResolvedPayload);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const nextPayload = await measureAsync("booking_confirmation_load", async () => {
          const schedules = await queryRows({
            table: "agendamentos",
            conditions: [{ field: "id", operator: "eq", value: Number(agendamentoId) }],
            limit: 1,
          });

          if (schedules.length === 0) {
            throw new Error("Agendamento nao encontrado.");
          }

          const schedule = schedules[0];

          const [businessRows, workerRows, serviceRows] = await Promise.all([
            queryRows({
              table: "business",
              conditions: [{ field: "id", operator: "eq", value: schedule.business_id }],
              limit: 1,
            }),
            queryRows({
              table: "trabalhadores",
              conditions: [{ field: "id", operator: "eq", value: schedule.trabalhador_id }],
              limit: 1,
            }),
            queryRows({
              table: "servicos",
              conditions: [{ field: "id", operator: "eq", value: schedule.servico_id }],
              limit: 1,
            }),
          ]);

          return {
            schedule,
            business: businessRows[0] ?? {},
            worker: workerRows[0] ?? {},
            service: serviceRows[0] ?? {},
          };
        }, { agendamentoId });

        if (!mounted) return;
        setPayload(nextPayload);
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (initialResolvedPayload) {
      return () => {
        mounted = false;
      };
    }

    if (agendamentoId) loadData();

    return () => {
      mounted = false;
    };
  }, [agendamentoId, initialResolvedPayload]);

  if (loading) {
    return <div className="confirmation-card">Carregando confirmacao...</div>;
  }

  if (!agendamentoId) {
    return (
      <div className="confirmation-card">
        <p className="error-text">ID de agendamento ausente.</p>
        <button className="ghost-btn" onClick={onBack}>Voltar</button>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="confirmation-card">
        <p className="error-text">{error || "Falha ao carregar confirmacao."}</p>
        <button className="ghost-btn" onClick={onBack}>Voltar</button>
      </div>
    );
  }

  const { schedule, business, worker, service, totalPrice } = payload;
  const whatsappBotPhone = firstText([business.whatsapp_bot, business.whatsapp, business.telefone]);
  const whatsappBotDigits = digitsOnly(whatsappBotPhone);
  const whatsappLink = whatsappBotDigits
    ? `https://wa.me/${whatsappBotDigits}?text=${encodeURIComponent("/meus_agendamentos")}`
    : null;

  return (
    <article className="confirmation-card">
      <header>
        <CheckCircle2 size={34} />
        <div>
          <h2>Agendamento confirmado</h2>
          <p>Seu horario foi reservado com sucesso.</p>
        </div>
      </header>

      <dl className="confirmation-grid">
        <div>
          <dt>Estabelecimento</dt>
          <dd>{business.nome || "Bora Cuidar"}</dd>
        </div>
        <div>
          <dt>Servico</dt>
          <dd>{service.nome || "Servico"}</dd>
        </div>
        <div>
          <dt>Profissional</dt>
          <dd>{worker.nome || "Profissional"}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{formatDate(schedule.data_agendamento)}</dd>
        </div>
        <div>
          <dt>Horario</dt>
          <dd>{schedule.hora_inicio || "--:--"} - {schedule.hora_fim || "--:--"}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatMoney(totalPrice ?? (service.preco || 0))}</dd>
        </div>
      </dl>

      <footer>
        <button className="ghost-btn" onClick={onBack}>Voltar ao estabelecimento</button>
        {whatsappLink ? (
          <a className="cta-btn" href={whatsappLink} target="_blank" rel="noreferrer">
            Ver meus agendamentos <ExternalLink size={15} />
          </a>
        ) : null}
      </footer>
    </article>
  );
}
