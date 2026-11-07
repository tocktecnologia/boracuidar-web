import { Link, useParams } from "react-router-dom";
import { Check, ChevronLeft } from "lucide-react";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import { marketplaceLinkForCategory } from "../components/rotina/links";
import { dimensionById } from "../lib/rotina/catalog";
import { trailBySlug } from "../lib/rotina/content";
import { toggleTrailStep, useRotina } from "../lib/rotina/store";

export default function TrilhaPage() {
  const { slug } = useParams();
  const state = useRotina();
  const trail = trailBySlug(slug);

  if (!trail) {
    return (
      <MarketplaceLayout>
        <div className="section-message">
          <h1>Trilha não encontrada</h1>
          <Link to="/aprender" className="ghost-btn">Voltar pra Aprender</Link>
        </div>
      </MarketplaceLayout>
    );
  }

  const done = new Set(state.trails?.[trail.slug] ?? []);
  const ratio = done.size / trail.steps.length;

  return (
    <MarketplaceLayout fullWidth>
      <div className="rotina-shell narrow trail-page">
        <Link to="/aprender" className="market-back-link"><ChevronLeft size={16} /> Aprender</Link>
        <p className="article-kind">Trilha · {dimensionById(trail.dim)?.label}</p>
        <h1>{trail.title}</h1>
        <p className="trail-summary">{trail.summary}</p>
        <div className="trail-progress">
          <span className="cycle-bar"><i style={{ width: `${ratio * 100}%` }} /></span>
          <small>{done.size} de {trail.steps.length} passos</small>
        </div>
        <ol className="trail-steps">
          {trail.steps.map((step, i) => {
            const on = done.has(i);
            return (
              <li key={i} className={on ? "done" : ""}>
                <button
                  type="button"
                  className={on ? "habit-check on" : "habit-check"}
                  aria-pressed={on}
                  aria-label={on ? `Desmarcar passo ${i + 1}` : `Marcar passo ${i + 1} como feito`}
                  onClick={() => toggleTrailStep(trail.slug, i)}
                >
                  <Check size={16} />
                </button>
                <div>
                  <small>Passo {i + 1}</small>
                  <p>{step}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {ratio === 1 ? <p className="trail-complete">Trilha concluída. O que funcionou pra você agora pode virar hábito na sua rotina.</p> : null}
        {trail.cta ? (
          <Link to={marketplaceLinkForCategory(trail.cta.category)} className="cta-btn trail-cta">{trail.cta.label}</Link>
        ) : null}
      </div>
    </MarketplaceLayout>
  );
}
