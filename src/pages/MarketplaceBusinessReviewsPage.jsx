import { useEffect, useMemo, useState } from "react";
import { Copy, Send, Star } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import StarRating from "../components/common/StarRating";
import { createEvaluation, queryRows } from "../lib/firestore";
import { evaluationSummary, firstText, formatDateTime, toInt, toNumber } from "../lib/marketplace";

function useBusinessId() {
  const { search } = useLocation();
  return new URLSearchParams(search).get("businessId")?.trim() ?? "";
}

function reviewLink(businessId) {
  const url = new URL(window.location.href);
  return `${url.origin}/marketplace/business/reviews?businessId=${encodeURIComponent(businessId)}`;
}

export default function MarketplaceBusinessReviewsPage() {
  const businessId = useBusinessId();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [business, setBusiness] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [evaluations, setEvaluations] = useState([]);

  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [selectedStars, setSelectedStars] = useState(5);
  const [authorName, setAuthorName] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      if (!businessId) {
        setError("businessId ausente na URL.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [businessRows, workerRows, evaluationRows] = await Promise.all([
          queryRows({
            table: "business",
            conditions: [{ field: "id", operator: "eq", value: businessId }],
            limit: 1,
          }),
          queryRows({
            table: "trabalhadores",
            conditions: [{ field: "business_id", operator: "eq", value: businessId }],
            orders: [{ field: "nome", ascending: true }],
          }),
          queryRows({
            table: "Evaluations",
            conditions: [{ field: "business_id", operator: "eq", value: businessId }],
            orders: [{ field: "created_at", ascending: false }],
          }),
        ]);

        if (!mounted) return;

        if (businessRows.length === 0) {
          throw new Error("Estabelecimento nao encontrado.");
        }

        const activeWorkers = workerRows.filter((worker) => worker.ativo !== false);

        setBusiness(businessRows[0]);
        setWorkers(activeWorkers.length > 0 ? activeWorkers : workerRows);
        setEvaluations(evaluationRows);

        const firstWorker = (activeWorkers.length > 0 ? activeWorkers : workerRows)[0];
        setSelectedWorkerId(firstWorker?.id ? String(firstWorker.id) : "");
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [businessId]);

  const summary = useMemo(() => evaluationSummary(evaluations), [evaluations]);

  async function submitEvaluation(event) {
    event.preventDefault();
    if (submitting) return;

    const workerId = toInt(selectedWorkerId);
    if (!workerId) {
      setError("Selecione um profissional.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await createEvaluation({
        businessId,
        workerId,
        stars: selectedStars,
        comment: comment.trim() || null,
        authorName: authorName.trim() || null,
        workerName: workers.find((item) => Number(item.id) === Number(workerId))?.nome,
      });

      const [businessRows, evaluationRows] = await Promise.all([
        queryRows({ table: "business", conditions: [{ field: "id", operator: "eq", value: businessId }], limit: 1 }),
        queryRows({
          table: "Evaluations",
          conditions: [{ field: "business_id", operator: "eq", value: businessId }],
          orders: [{ field: "created_at", ascending: false }],
        }),
      ]);

      setBusiness(businessRows[0] ?? business);
      setEvaluations(evaluationRows);
      setSelectedStars(5);
      setComment("");
    } catch (submitError) {
      setError(`Nao foi possivel enviar avaliacao: ${submitError.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(reviewLink(businessId));
  }

  function shareWhatsapp() {
    const businessName = firstText([business?.nome]) ?? "este estabelecimento";
    const message = `Deixe sua avaliacao para ${businessName}: ${reviewLink(businessId)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return (
      <MarketplaceLayout hideTopbar>
        <p className="section-message">Carregando avaliacoes...</p>
      </MarketplaceLayout>
    );
  }

  if (error && !business) {
    return (
      <MarketplaceLayout hideTopbar>
        <div className="section-message">
          <p className="error-text">{error}</p>
          <Link className="ghost-btn" to="/marketplace">Voltar ao marketplace</Link>
        </div>
      </MarketplaceLayout>
    );
  }

  const businessName = firstText([business?.nome]) ?? "Estabelecimento";

  return (
    <MarketplaceLayout hideTopbar>
      <section className="reviews-page">
        <header className="surface-block">
          <h1>Avaliacoes de {businessName}</h1>
          <p>Compartilhe sua experiencia para ajudar outros clientes.</p>
          <div className="hero-meta">
            <span><Star size={14} /> {summary.count > 0 ? `${summary.average.toFixed(1)} de 5` : "Sem notas"}</span>
            <span>{summary.count} avaliacoes publicadas</span>
          </div>
          <div className="review-share-actions">
            <button className="ghost-btn" onClick={copyLink}><Copy size={15} /> Copiar link</button>
            <button className="ghost-btn" onClick={shareWhatsapp}><Send size={15} /> Compartilhar no WhatsApp</button>
            <Link className="ghost-btn" to={`/marketplace/business?businessId=${encodeURIComponent(businessId)}`}>Voltar ao estabelecimento</Link>
          </div>
        </header>

        <form className="surface-block review-form" onSubmit={submitEvaluation}>
          <h2>Escrever avaliacao</h2>
          <label>Seu nome (opcional)</label>
          <input value={authorName} onChange={(event) => setAuthorName(event.target.value)} placeholder="Seu nome" />

          <label>Profissional</label>
          <select value={selectedWorkerId} onChange={(event) => setSelectedWorkerId(event.target.value)}>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>{worker.nome ?? "Profissional"}</option>
            ))}
          </select>

          <label>Nota</label>
          <div className="stars-pick">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                type="button"
                key={value}
                className={selectedStars >= value ? "star-btn active" : "star-btn"}
                onClick={() => setSelectedStars(value)}
              >
                <Star size={18} />
              </button>
            ))}
          </div>

          <label>Comentario</label>
          <textarea
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Conte como foi seu atendimento"
          />

          {error ? <p className="error-text">{error}</p> : null}

          <button className="cta-btn" type="submit" disabled={submitting}>{submitting ? "Enviando..." : "Enviar avaliacao"}</button>
        </form>

        <article className="surface-block">
          <h2>Ultimas avaliacoes</h2>
          {evaluations.length === 0 ? <p className="muted">Ainda sem avaliacoes registradas.</p> : null}
          <div className="reviews-list">
            {evaluations.slice(0, 40).map((evaluation) => (
              <div key={evaluation.id ?? `${evaluation.created_at}-${evaluation.name}`} className="review-row">
                <div>
                  <strong>{firstText([evaluation.name, evaluation.email]) ?? "Cliente"}</strong>
                  <small>{formatDateTime(evaluation.created_at)}</small>
                </div>
                <StarRating value={toNumber(evaluation.stars)} />
                <p>{firstText([evaluation.comment, evaluation.comentario]) ?? "Sem comentario."}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </MarketplaceLayout>
  );
}
