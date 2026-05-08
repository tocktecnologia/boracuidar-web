import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { queryRows } from "../../lib/firestore";
import { formatDate, formatMoney, whatsappHref } from "../../lib/marketplace";

export default function BookingConfirmationCard({ agendamentoId, onBack }) {
  const [loading, setLoading] = useState(Boolean(agendamentoId));
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      setError("");
      try {
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

        if (!mounted) return;

        setPayload({
          schedule,
          business: businessRows[0] ?? {},
          worker: workerRows[0] ?? {},
          service: serviceRows[0] ?? {},
        });
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (agendamentoId) loadData();

    return () => {
      mounted = false;
    };
  }, [agendamentoId]);

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

  const { schedule, business, worker, service } = payload;
  const businessContact = business.whatsapp || business.telefone;
  const whatsappLink = whatsappHref(businessContact);

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
          <dd>{formatMoney(service.preco || 0)}</dd>
        </div>
      </dl>

      <footer>
        <button className="ghost-btn" onClick={onBack}>Voltar ao estabelecimento</button>
        {whatsappLink ? (
          <a className="cta-btn" href={whatsappLink} target="_blank" rel="noreferrer">
            Salvar Resumo <ExternalLink size={15} />
          </a>
        ) : null}
      </footer>
    </article>
  );
}
