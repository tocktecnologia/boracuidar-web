import { useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks } from "lucide-react";
import { formatInterval } from "../../lib/rotina/engine";
import { getRotina, registerBooking } from "../../lib/rotina/store";

// Depois de um agendamento confirmado: fecha o ciclo na rotina e mostra o próximo passo.
export default function RotinaBookingNote({ agendamentoId, serviceName, businessName, businessCategory, dateValue }) {
  // registra uma vez; a operação é idempotente pelo id do agendamento
  const [cycles] = useState(() =>
    agendamentoId ? registerBooking({ agendamentoId, serviceName, businessName, businessCategory, dateValue }) : [],
  );

  const onboarded = getRotina().onboarded;

  if (cycles.length > 0 && onboarded) {
    const first = cycles[0];
    const saved = getRotina().cycles.find((c) => c.id === first.id);
    const labels = cycles.map((c) => c.label).join(" e ");
    return (
      <div className="rotina-booking-note">
        <ListChecks size={18} aria-hidden="true" />
        <p>
          <strong>{labels} {cycles.length > 1 ? "registrados" : "registrado"} na sua rotina.</strong> Depois do atendimento,
          a gente te lembra do próximo em {formatInterval(saved?.intervalDays ?? first.intervalDays)}.
        </p>
        <Link to="/cuidados" className="icon-text-btn">Ver</Link>
      </div>
    );
  }

  return (
    <div className="rotina-booking-note">
      <ListChecks size={18} aria-hidden="true" />
      <p>
        <strong>Quer lembrar do próximo?</strong> Monte sua rotina de autocuidado e a gente avisa quando chegar a hora.
      </p>
      <Link to="/" className="icon-text-btn">Montar</Link>
    </div>
  );
}
