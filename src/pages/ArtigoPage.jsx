import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Clock3 } from "lucide-react";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import HelpCard from "../components/rotina/HelpCard";
import { marketplaceLinkForCategory } from "../components/rotina/links";
import { dimensionById } from "../lib/rotina/catalog";
import { ARTICLES, articleBySlug } from "../lib/rotina/content";
import { markArticleRead } from "../lib/rotina/store";

const CATEGORY_BY_DIM = { saude: "Clínica", mente: "Clínica", alimentacao: "Clínica", aparencia: "Estética", movimento: "Personal", tempo: "Estética" };

export default function ArtigoPage() {
  const { slug } = useParams();
  const article = articleBySlug(slug);
  useState(() => (article ? markArticleRead(article.slug) : null));

  if (!article) {
    return (
      <MarketplaceLayout>
        <div className="section-message">
          <h1>Conteúdo não encontrado</h1>
          <Link to="/aprender" className="ghost-btn">Voltar pra Aprender</Link>
        </div>
      </MarketplaceLayout>
    );
  }

  const related = ARTICLES.filter((a) => a.slug !== article.slug && a.dim === article.dim).slice(0, 2);
  const category = CATEGORY_BY_DIM[article.dim];

  return (
    <MarketplaceLayout fullWidth>
      <article className="rotina-shell narrow article-page">
        <Link to="/aprender" className="market-back-link"><ChevronLeft size={16} /> Aprender</Link>
        <p className="article-kind">{article.kind} · {dimensionById(article.dim)?.label}</p>
        <h1>{article.title}</h1>
        <p className="article-meta"><Clock3 size={14} aria-hidden="true" /> {article.minutes} min de leitura</p>
        {article.verdict ? <p className={`article-verdict v-${article.verdict === "Mito" ? "mito" : "parte"}`}>{article.verdict}</p> : null}
        <div className="article-body">
          {article.body.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
        </div>
        {article.dim === "mente" ? <HelpCard /> : null}
        {category ? (
          <Link to={marketplaceLinkForCategory(category)} className="rotina-panel explore-link">
            <span><strong>Quer conversar com um profissional?</strong><small>Veja quem atende perto de você</small></span>
            <ChevronLeft size={18} style={{ transform: "rotate(180deg)" }} aria-hidden="true" />
          </Link>
        ) : null}
        <p className="rotina-footnote">Conteúdo informativo. Não substitui a avaliação de um profissional de saúde.</p>
        {related.length > 0 ? (
          <section className="article-related">
            <h2>Continue lendo</h2>
            <ul className="article-list">
              {related.map((a) => (
                <li key={a.slug}>
                  <Link to={`/aprender/artigo/${a.slug}`} className="article-row">
                    <div>
                      <span className="article-kind">{a.kind}</span>
                      <strong>{a.title}</strong>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </MarketplaceLayout>
  );
}
