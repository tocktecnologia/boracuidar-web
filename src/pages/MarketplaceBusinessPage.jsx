import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  UserRound,
} from "lucide-react";
import { motion } from "framer-motion";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import BookingDialog from "../components/booking/BookingDialog";
import StarRating from "../components/common/StarRating";
import { queryRows } from "../lib/firestore";
import {
  coverFromPageOrBusiness,
  evaluationSummary,
  extractPageFromBusiness,
  firstText,
  formatDateTime,
  formatMoney,
  toBool,
  toInt,
  toNumber,
  whatsappHref,
} from "../lib/marketplace";

function useBusinessId() {
  const { search } = useLocation();
  return new URLSearchParams(search).get("businessId")?.trim() ?? "";
}

function workerPhoto(worker) {
  const photo = firstText([
    worker?.photo_url,
    worker?.photoUrl,
    worker?.foto_url,
    worker?.avatar_url,
    worker?.avatarUrl,
    worker?.image_url,
  ]);
  return photo?.startsWith("http") ? photo : null;
}

function isAnonymousEvaluation(row) {
  const anonymous = toBool(row?.is_anonymous) || toBool(row?.anonymous) || toBool(row?.anonimo);
  if (anonymous) return true;

  const name = String(row?.name ?? "").trim();
  const email = String(row?.email ?? "").trim();
  if (!name && !email) return true;

  const normalized = name.toLowerCase();
  return normalized.includes("anonymous") || normalized.includes("anonim");
}

export default function MarketplaceBusinessPage() {
  const businessId = useBusinessId();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [business, setBusiness] = useState(null);
  const [page, setPage] = useState(null);
  const [services, setServices] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [evaluations, setEvaluations] = useState([]);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingServiceId, setBookingServiceId] = useState(null);

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
        const businessRows = await queryRows({
          table: "business",
          conditions: [{ field: "id", operator: "eq", value: businessId }],
          limit: 1,
        });

        if (businessRows.length === 0) {
          throw new Error("Estabelecimento nao encontrado.");
        }

        const currentBusiness = businessRows[0];
        let currentPage = extractPageFromBusiness(currentBusiness, false);

        if (!currentPage) {
          const [legacyRows] = await Promise.all([
            queryRows({
              table: "business-page",
              conditions: [{ field: "business_id", operator: "eq", value: businessId }],
              limit: 1,
            }),
          ]);
          currentPage = legacyRows[0] ?? null;
        }

        const allowPage = toBool(currentPage?.allow_page) || toBool(currentBusiness.allow_page);
        if (!allowPage) {
          throw new Error("Esta pagina ainda esta em processo de aprovacao no marketplace.");
        }

        const [serviceRows, workerRows, evaluationRows] = await Promise.all([
          queryRows({
            table: "servicos",
            conditions: [
              { field: "business_id", operator: "eq", value: businessId },
              { field: "ativo", operator: "eq", value: true },
            ],
            orders: [{ field: "nome", ascending: true }],
          }),
          queryRows({
            table: "trabalhadores",
            conditions: [
              { field: "business_id", operator: "eq", value: businessId },
              { field: "ativo", operator: "eq", value: true },
            ],
            orders: [{ field: "nome", ascending: true }],
          }),
          queryRows({
            table: "Evaluations",
            conditions: [{ field: "business_id", operator: "eq", value: businessId }],
            orders: [{ field: "created_at", ascending: false }],
          }),
        ]);

        if (!mounted) return;

        setBusiness(currentBusiness);
        setPage(currentPage ?? {});
        setServices(serviceRows);
        setWorkers(workerRows);
        setEvaluations(evaluationRows.filter((row) => !isAnonymousEvaluation(row)));
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

  const cover = useMemo(() => coverFromPageOrBusiness(page, business, 0), [business, page]);
  const gallery = useMemo(() => {
    const fromGallery = Array.isArray(page?.gallery)
      ? page.gallery
          .map((entry) => (typeof entry === "string" ? entry : entry?.url))
          .map((url) => String(url ?? "").trim())
          .filter((url) => url.startsWith("http"))
      : [];

    if (fromGallery.length > 0) return fromGallery;

    const fromUrls = Array.isArray(page?.gallery_urls)
      ? page.gallery_urls.map((url) => String(url ?? "").trim()).filter((url) => url.startsWith("http"))
      : [];

    if (fromUrls.length > 0) return fromUrls;
    return [cover];
  }, [cover, page]);

  const reviewSummary = useMemo(() => {
    const fallback = evaluationSummary(evaluations);
    return {
      average: toNumber(business?.average_stars || page?.average_rating || fallback.average),
      count: Number(business?.reviews_count || page?.reviews_count || fallback.count || 0),
    };
  }, [business, evaluations, page]);

  function openBooking(initialServiceId = null) {
    setBookingServiceId(initialServiceId);
    setBookingOpen(true);
  }

  function handleBookingSuccess(agendamentoId) {
    navigate(
      `/marketplace/confirmation?agendamentoId=${encodeURIComponent(agendamentoId)}&businessId=${encodeURIComponent(businessId)}`,
    );
  }

  if (loading) {
    return (
      <MarketplaceLayout hideTopbar fullWidth>
        <p className="section-message">Carregando estabelecimento...</p>
      </MarketplaceLayout>
    );
  }

  if (error || !business) {
    return (
      <MarketplaceLayout hideTopbar fullWidth>
        <div className="section-message">
          <p className="error-text">{error || "Nao foi possivel carregar este estabelecimento."}</p>
          <Link className="ghost-btn" to="/marketplace">
            Voltar ao marketplace
          </Link>
        </div>
      </MarketplaceLayout>
    );
  }

  const businessName = firstText([business.nome, page?.title]) ?? "Estabelecimento";
  const description =
    firstText([page?.headline, page?.short_description, page?.about, business.descricao]) ??
    "Estabelecimento parceiro do Bora Cuidar.";

  const contactPhone = firstText([page?.contact, page?.phone, business.whatsapp, business.telefone]);
  const whatsappLink = whatsappHref(contactPhone);

  return (
    <MarketplaceLayout hideTopbar fullWidth>
      <section className="business-hero">
        <img src={cover} alt={businessName} className="business-hero-bg" />
        <div className="business-hero-overlay" />

        <div className="business-hero-topline">
          <img
            src={firstText([page?.logo_url, business.logo_url]) || "/assets/brand/icon-mark.png"}
            alt={businessName}
            className="hero-business-logo"
          />
          <span className="brand-badge on-hero">
            <CheckCircle2 size={14} />
            Bora Cuidar
          </span>
        </div>

        <motion.div className="business-hero-content" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }}>
          <h1>{businessName}</h1>
          <div className="hero-meta">
            <span>
              <Star size={14} />
              {reviewSummary.count > 0
                ? `${reviewSummary.average.toFixed(1)} (${reviewSummary.count} avaliacoes)`
                : "Sem avaliacoes"}
            </span>
            <span>
              <MapPin size={14} />
              {firstText([business.cidade, page?.city, page?.address, business.endereco]) ?? "Endereco"}
            </span>
          </div>
          <div className="hero-actions">
            <button className="cta-btn" onClick={() => openBooking()}>
              <CalendarClock size={16} /> Agendar
            </button>
          </div>
          <p className="hero-description">{description}</p>
        </motion.div>
      </section>

      <section className="business-content-grid">
        <div>
          <article className="surface-block">
            <h2>Fotos do seu espaco</h2>
            <div className="gallery-grid">
              {gallery.map((imageUrl, index) => (
                <img key={`${imageUrl}-${index}`} src={imageUrl} alt={`${businessName} ${index + 1}`} />
              ))}
            </div>
          </article>

          <article className="surface-block">
            <h2>Sobre este estabelecimento</h2>
            <p>{description}</p>
            <p className="address-strong">{firstText([page?.address, business.endereco]) ?? "Endereco em atualizacao"}</p>
          </article>

          <article className="surface-block">
            <h2>Servicos</h2>
            {services.length === 0 ? <p className="muted">Servicos em atualizacao.</p> : null}
            {services.map((service) => (
              <div className="service-row" key={service.id}>
                <div>
                  <strong>{service.nome ?? "Servico"}</strong>
                  <p>{service.descricao ?? "Atendimento especializado"}</p>
                </div>
                <div>
                  <span>{formatMoney(service.preco || 0)}</span>
                  <small>{toInt(service.duracao_minutos) ?? 30} min</small>
                  <button className="cta-btn" onClick={() => openBooking(service.id)}>
                    Agendar
                  </button>
                </div>
              </div>
            ))}
          </article>

          <article className="surface-block">
            <div className="section-head-inline">
              <h2>Avaliacoes recentes</h2>
              <Link className="ghost-btn" to={`/marketplace/business/reviews?businessId=${encodeURIComponent(businessId)}`}>
                Ver todas
              </Link>
            </div>
            {evaluations.length === 0 ? <p className="muted">Nenhuma avaliacao publica no momento.</p> : null}
            {evaluations.slice(0, 6).map((evaluation) => (
              <div className="review-row" key={evaluation.id ?? `${evaluation.created_at}-${evaluation.name}`}>
                <div>
                  <strong>{firstText([evaluation.name, evaluation.email]) ?? "Cliente"}</strong>
                  <small>{formatDateTime(evaluation.created_at)}</small>
                </div>
                <StarRating value={toNumber(evaluation.stars)} />
                <p>{firstText([evaluation.comment, evaluation.comentario]) ?? "Sem comentario."}</p>
              </div>
            ))}
          </article>
        </div>

        <aside>
          <article className="surface-block">
            <Link className="cta-btn" to={`/marketplace/meus-agendamentos?businessId=${encodeURIComponent(businessId)}`}>
              Meus agendamentos
            </Link>

            <h3>Contato</h3>
            <p>{contactPhone || "Contato em atualizacao"}</p>
            <p>{firstText([page?.address, business.endereco]) ?? "Endereco em atualizacao"}</p>

            <div className="contact-actions">
              {whatsappLink ? (
                <a className="ghost-btn" href={whatsappLink} target="_blank" rel="noreferrer">
                  <MessageCircle size={15} /> WhatsApp <ExternalLink size={14} />
                </a>
              ) : null}
              {contactPhone ? (
                <a className="ghost-btn" href={`tel:${contactPhone}`}>
                  <Phone size={15} /> {contactPhone}
                </a>
              ) : null}
            </div>
          </article>

          <article className="surface-block">
            <h3>Equipe ({workers.length})</h3>
            {workers.length === 0 ? <p className="muted">Equipe em atualizacao.</p> : null}
            <div className="worker-list">
              {workers.map((worker) => (
                <div key={worker.id ?? worker.nome} className="worker-row">
                  {workerPhoto(worker) ? (
                    <img src={workerPhoto(worker)} alt={worker.nome ?? "Profissional"} />
                  ) : (
                    <UserRound size={16} />
                  )}
                  <span>{worker.nome ?? "Profissional"}</span>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>

      <BookingDialog
        isOpen={bookingOpen}
        businessId={businessId}
        initialServiceId={bookingServiceId}
        onClose={() => setBookingOpen(false)}
        onSuccess={handleBookingSuccess}
      />
    </MarketplaceLayout>
  );
}
