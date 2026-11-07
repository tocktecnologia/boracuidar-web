import { Link } from "react-router-dom";
import { useState } from "react";
import { Check, ChevronRight, Clock3, Megaphone, Route, Target } from "lucide-react";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import { DimensionIcon } from "../components/rotina/RotinaIcon";
import { DIMENSIONS, dimensionById } from "../lib/rotina/catalog";
import { ARTICLES, CAMPAIGNS, CHALLENGES, TRAILS, articleBySlug } from "../lib/rotina/content";
import { challengeProgress, dateKey, parseKey } from "../lib/rotina/engine";
import { addHabit, joinChallenge, leaveChallenge, useRotina } from "../lib/rotina/store";

export default function AprenderPage() {
  const state = useRotina();
  const today = dateKey();
  const priorities = state.raiox?.priorities ?? [];
  const [filter, setFilter] = useState("todos");
  const campaign = CAMPAIGNS[parseKey(today).getMonth() + 1];

  const trails = [...TRAILS].sort((a, b) => Number(priorities.includes(b.dim)) - Number(priorities.includes(a.dim)));
  const articles = ARTICLES.filter((a) => filter === "todos" || a.dim === filter).sort(
    (a, b) => Number(priorities.includes(b.dim)) - Number(priorities.includes(a.dim)),
  );
  const usedDims = DIMENSIONS.filter((d) => ARTICLES.some((a) => a.dim === d.id));

  return (
    <MarketplaceLayout fullWidth>
      <div className="rotina-shell">
        <header className="page-head">
          <h1>Aprender</h1>
          <p>Trilhas, desafios e leituras curtas pra cuidar de você com informação boa.</p>
        </header>

        {campaign ? (
          <Link to={`/aprender/artigo/${campaign.article}`} className="campaign-hero">
            <span className="rotina-panel-label"><Megaphone size={14} /> Campanha do mês</span>
            <strong>{campaign.title}</strong>
            <p>{campaign.text}</p>
            <span className="icon-text-btn">Ler: {articleBySlug(campaign.article)?.title} <ChevronRight size={15} /></span>
          </Link>
        ) : null}

        <section className="learn-section">
          <div className="rotina-section-head">
            <h2><Route size={18} aria-hidden="true" /> Trilhas</h2>
          </div>
          <div className="trail-grid">
            {trails.map((trail) => {
              const done = state.trails?.[trail.slug]?.length ?? 0;
              const ratio = done / trail.steps.length;
              return (
                <Link key={trail.slug} to={`/aprender/trilha/${trail.slug}`} className="trail-card">
                  <span className="habit-icon"><DimensionIcon id={trail.dim} /></span>
                  <strong>{trail.title}</strong>
                  <p>{trail.summary}</p>
                  <div className="trail-card-foot">
                    <small>{done === 0 ? `${trail.steps.length} passos` : done === trail.steps.length ? "Concluída" : `${done} de ${trail.steps.length} passos`}</small>
                    {priorities.includes(trail.dim) ? <span className="status-chip ok">Pra você</span> : null}
                  </div>
                  <span className="cycle-bar"><i style={{ width: `${ratio * 100}%` }} /></span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="learn-section" id="desafios">
          <div className="rotina-section-head">
            <h2><Target size={18} aria-hidden="true" /> Desafios</h2>
          </div>
          <p className="muted learn-lead">Entrar num desafio adiciona o hábito na sua rotina. O progresso conta sozinho a partir dos seus registros.</p>
          <ul className="challenge-list">
            {CHALLENGES.map((ch) => {
              const joined = (state.challenges ?? []).find((c) => c.id === ch.id);
              const progress = joined ? challengeProgress(state, ch, joined.start, today) : null;
              return (
                <li key={ch.id} className={joined ? "challenge-card joined" : "challenge-card"}>
                  <span className="habit-icon"><DimensionIcon id={ch.dim} /></span>
                  <div className="challenge-text">
                    <strong>{ch.label}</strong>
                    <small>{progress ? (progress.complete ? "Concluído. Mandou bem." : `${progress.done} de ${progress.total} dias`) : ch.description}</small>
                    {progress ? <span className="cycle-bar"><i style={{ width: `${(progress.done / progress.total) * 100}%` }} /></span> : null}
                  </div>
                  {joined ? (
                    <button type="button" className="icon-text-btn" onClick={() => leaveChallenge(ch.id)}>Sair</button>
                  ) : (
                    <button
                      type="button"
                      className="ghost-btn small"
                      disabled={!state.onboarded}
                      onClick={() => {
                        ch.habits.slice(0, 1).forEach((h) => addHabit(h));
                        joinChallenge(ch.id);
                      }}
                    >
                      Participar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="learn-section">
          <div className="rotina-section-head">
            <h2>Leituras</h2>
          </div>
          <div className="raiox-chip-row learn-filters" role="tablist" aria-label="Filtrar por área">
            <button type="button" role="tab" aria-selected={filter === "todos"} className={filter === "todos" ? "raiox-chip active" : "raiox-chip"} onClick={() => setFilter("todos")}>Tudo</button>
            {usedDims.map((d) => (
              <button key={d.id} type="button" role="tab" aria-selected={filter === d.id} className={filter === d.id ? "raiox-chip active" : "raiox-chip"} onClick={() => setFilter(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <ul className="article-list">
            {articles.map((a) => {
              const read = (state.readArticles ?? []).includes(a.slug);
              return (
                <li key={a.slug}>
                  <Link to={`/aprender/artigo/${a.slug}`} className="article-row">
                    <div>
                      <span className="article-kind">{a.kind}{a.verdict ? ` · ${a.verdict}` : ""}</span>
                      <strong>{a.title}</strong>
                      <small><Clock3 size={12} aria-hidden="true" /> {a.minutes} min · {dimensionById(a.dim)?.label}{read ? " · Lido" : ""}</small>
                    </div>
                    {read ? <Check size={18} className="article-read" aria-label="Lido" /> : <ChevronRight size={18} aria-hidden="true" />}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="rotina-footnote">Conteúdo de exemplo. Antes do lançamento, cada texto passa pela revisão de um profissional com registro.</p>
        </section>
      </div>
    </MarketplaceLayout>
  );
}
