import { LifeBuoy } from "lucide-react";
import { HELP_CONTACTS } from "../../lib/rotina/content";

export default function HelpCard({ tone = "default" }) {
  return (
    <section className={`help-card ${tone}`} aria-label="Ajuda imediata">
      <p className="help-card-title"><LifeBuoy size={16} aria-hidden="true" /> Precisa de ajuda agora?</p>
      <ul>
        {HELP_CONTACTS.map((c) => (
          <li key={c.number}>
            <a href={`tel:${c.number}`}><strong>{c.number}</strong></a>
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
