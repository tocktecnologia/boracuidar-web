import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Star,
} from "lucide-react";
import { motion } from "framer-motion";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import BookingDialog from "../components/booking/BookingDialog";
import BusinessSchedulesDialog from "../components/schedules/BusinessSchedulesDialog";
import StarRating from "../components/common/StarRating";
import { queryRows } from "../lib/firestore";
import { measureAsync } from "../lib/observability";
import {
  coverFromPageOrBusiness,
  evaluationSummary,
  extractPageFromBusiness,
  firstText,
  formatBusinessHours,
  formatDateTime,
  formatMoney,
  toBool,
  toInt,
  toNumber,
  whatsappHref,
} from "../lib/marketplace";

function useBusinessRouteState(providedBusinessId) {
  const { search } = useLocation();
  const provided = String(providedBusinessId ?? "").trim();
  if (provided) return { businessId: provided, redirectToServices: false };
  const raw = new URLSearchParams(search).get("businessId")?.trim() ?? "";
  if (!raw) return { businessId: "", redirectToServices: false };
  const normalized = raw.replace(/\/+$/, "");
  if (normalized.toLowerCase().endsWith("/services")) {
    return {
      businessId: normalized.slice(0, -9),
      redirectToServices: true,
    };
  }
  return { businessId: normalized, redirectToServices: false };
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

export default function MarketplaceBusinessPage({ businessId: providedBusinessId }) {
  const { businessId, redirectToServices } = useBusinessRouteState(providedBusinessId);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [business, setBusiness] = useState(null);
  const [page, setPage] = useState(null);
  const [services, setServices] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [evaluations, setEvaluations] = useState([]);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [schedulesDialogOpen, setSchedulesDialogOpen] = useState(false);
  const [bookingServiceId, setBookingServiceId] = useState(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [serviceQuery, setServiceQuery] = useState("");
  const servicesSectionRef = useRef(null);
  const reviewsSectionRef = useRef(null);

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
        const businessRows = await measureAsync("business_page_load_business", () => queryRows({
          table: "business",
          conditions: [{ field: "id", operator: "eq", value: businessId }],
          limit: 1,
        }), { businessId });

        if (businessRows.length === 0) {
          throw new Error("Estabelecimento não encontrado.");
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
          throw new Error("Esta página ainda está em processo de aprovação no marketplace.");
        }

        const [serviceRows, workerRows, evaluationRows] = await measureAsync("business_page_load_related", () => Promise.all([
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
        ]), { businessId });

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

  const filteredServices = useMemo(() => {
    const term = serviceQuery.trim().toLowerCase();
    if (!term) return services;
    return services.filter((service) => {
      const name = String(service?.nome ?? "").toLowerCase();
      const description = String(service?.descricao ?? "").toLowerCase();
      return name.includes(term) || description.includes(term);
    });
  }, [serviceQuery, services]);

  function openBooking(initialServiceId = null) {
    setBookingServiceId(initialServiceId);
    setBookingOpen(true);
  }

  function scrollToServices() {
    servicesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleBookingSuccess(agendamentoId, confirmationPayload = null) {
    navigate(
      `/marketplace/confirmation?agendamentoId=${encodeURIComponent(agendamentoId)}&businessId=${encodeURIComponent(businessId)}`,
      confirmationPayload ? { state: { confirmationPayload } } : undefined,
    );
  }

  if (redirectToServices && businessId) {
    return (
      <Navigate
        to={`/marketplace/business/services?businessId=${encodeURIComponent(businessId)}`}
        replace
      />
    );
  }

  if (loading) {
    return (
      <MarketplaceLayout fullWidth showFooter hideTabBar>
        <p className="section-message">Carregando estabelecimento...</p>
      </MarketplaceLayout>
    );
  }

  if (error || !business) {
    return (
      <MarketplaceLayout fullWidth showFooter hideTabBar>
        <div className="section-message">
          <p className="error-text">{error || "Não foi possível carregar este estabelecimento."}</p>
          <Link className="ghost-btn" to="/marketplace">
            Voltar ao marketplace
          </Link>
        </div>
      </MarketplaceLayout>
    );
  }

  const businessName = firstText([business.nome, page?.title]) ?? "Estabelecimento";
  const description =
    firstText([page?.about, page?.headline, page?.short_description, business.descricao]) ??
    "Estabelecimento parceiro do Bora Cuidar.";

  const contactPhone = firstText([page?.contact, page?.phone, business.whatsapp, business.telefone]);
  const whatsappLink = whatsappHref(contactPhone);
  const address = firstText([page?.address, business.endereco, page?.city, business.cidade]) ?? "Endereço em atualização";
  const cityLabel = firstText([business.cidade, page?.city]);
  const mapQuery = encodeURIComponent(`${businessName} ${address}`);
  const mapEmbedSrc = `https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
  const hoursLabel = formatBusinessHours(page, business) ?? "Consulte os horários disponíveis no agendamento.";
  const amenities = Array.isArray(page?.amenities)
    ? page.amenities.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 6)
    : [];
  const selectedPhotoIndex = activePhotoIndex < gallery.length ? activePhotoIndex : 0;
  const activePhoto = gallery[selectedPhotoIndex] ?? cover;

  const prices = services.map((service) => toNumber(service.preco)).filter((value) => value > 0);
  const startingPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const ratingLabel = reviewSummary.count > 0 ? reviewSummary.average.toFixed(1).replace(".", ",") : null;

  return (
    <MarketplaceLayout fullWidth showFooter hideTabBar>
      <section className="business-profile-wrap">
        <Link className="market-back-link" to="/marketplace">
          <ChevronLeft size={16} /> Explorar
        </Link>

        <motion.header className="business-profile-head" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="business-profile-brand">
            <img
              src={firstText([page?.logo_url, business.logo_url]) || "/assets/brand/icon-mark.png"}
              alt={businessName}
              className="business-profile-logo"
            />
            <div>
              <h1>{businessName}</h1>
              <div className="business-profile-meta">
                {ratingLabel ? (
                  <span className="business-meta-rating">
                    <Star size={14} />
                    <strong>{ratingLabel}</strong>
                    <button type="button" onClick={() => reviewsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                      {reviewSummary.count} {reviewSummary.count === 1 ? "avaliação" : "avaliações"}
                    </button>
                  </span>
                ) : (
                  <span>Novo no BoraCuidar</span>
                )}
                {cityLabel ? <span>{cityLabel}</span> : null}
                <span className="business-meta-verified">
                  <CheckCircle2 size={14} /> Agendamento online
                </span>
              </div>
            </div>
          </div>

          <div className="business-profile-head-actions">
            <button className="ghost-btn" onClick={() => setSchedulesDialogOpen(true)} type="button">
              Meus agendamentos
            </button>
            <button className="cta-btn business-book-now-btn" type="button" onClick={scrollToServices}>
              <CalendarClock size={16} /> Agendar
            </button>
          </div>
        </motion.header>

        <section className={gallery.length > 1 ? "business-gallery-stage has-thumbs" : "business-gallery-stage"}>
          <div className="business-stage-main">
            <img src={activePhoto} alt={businessName} className="business-stage-photo" />
            {gallery.length > 1 ? (
              <span className="business-stage-count">{selectedPhotoIndex + 1} / {gallery.length}</span>
            ) : null}
          </div>
          {gallery.length > 1 ? (
            <div className="business-gallery-thumbs">
              {gallery.slice(0, 6).map((imageUrl, index) => (
                <button
                  key={`${imageUrl}-${index}`}
                  type="button"
                  className={index === selectedPhotoIndex ? "business-thumb active" : "business-thumb"}
                  onClick={() => setActivePhotoIndex(index)}
                  aria-label={`Ver foto ${index + 1}`}
                >
                  <img src={imageUrl} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <div className="business-profile-grid">
          <div className="business-main-column">
            <section className="business-about">
              <h2>Sobre</h2>
              <p>{description}</p>
            </section>

            <section ref={servicesSectionRef} className="business-services-panel">
              <div className="business-services-head">
                <h2>Serviços</h2>
                <label className="business-service-search">
                  <Search size={15} />
                  <input
                    value={serviceQuery}
                    onChange={(event) => setServiceQuery(event.target.value)}
                    placeholder="Buscar serviço"
                    aria-label="Buscar serviço"
                  />
                </label>
              </div>

              {filteredServices.length === 0 ? <p className="muted">Nenhum serviço encontrado.</p> : null}

              <div className="business-service-list">
                {filteredServices.map((service) => (
                  <article className="business-service-row" key={service.id}>
                    <div>
                      <strong>{service.nome ?? "Serviço"}</strong>
                      {service.descricao ? <p>{service.descricao}</p> : null}
                      <small>{toInt(service.duracao_minutos) ?? 30} min</small>
                    </div>
                    <div className="business-service-row-actions">
                      <span>{formatMoney(service.preco || 0)}</span>
                      <button className="cta-btn" type="button" onClick={() => openBooking(service.id)}>
                        Agendar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="business-reviews-panel" ref={reviewsSectionRef}>
              <div className="section-head-inline">
                <h2>
                  Avaliações
                  {ratingLabel ? (
                    <span className="business-reviews-score"><Star size={16} /> {ratingLabel} · {reviewSummary.count}</span>
                  ) : null}
                </h2>
                <Link className="ghost-btn" to={`/marketplace/business/reviews?businessId=${encodeURIComponent(businessId)}`}>
                  Ver todas
                </Link>
              </div>
              {evaluations.length === 0 ? <p className="muted">Nenhuma avaliação pública no momento.</p> : null}
              <div className="reviews-list">
                {evaluations.slice(0, 6).map((evaluation) => {
                  const author = firstText([evaluation.name, evaluation.email]) ?? "Cliente";
                  return (
                    <div className="review-row" key={evaluation.id ?? `${evaluation.created_at}-${evaluation.name}`}>
                      <div>
                        <span className="review-avatar" aria-hidden="true">{author.slice(0, 1).toUpperCase()}</span>
                        <strong>{author}</strong>
                        <small>{formatDateTime(evaluation.created_at)}</small>
                      </div>
                      <StarRating value={toNumber(evaluation.stars)} size={14} />
                      <p>{firstText([evaluation.comment, evaluation.comentario]) ?? "Sem comentário."}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="business-side-column">
            <article className="business-book-card">
              <p className="business-book-card-label">Agendamento online</p>
              <strong>{startingPrice > 0 ? `A partir de ${formatMoney(startingPrice)}` : "Consulte valores"}</strong>
              <p className="business-hours-line">
                <Clock3 size={14} />
                {hoursLabel}
              </p>
              <button className="cta-btn" type="button" onClick={scrollToServices}>
                Ver horários disponíveis
              </button>
              {whatsappLink ? (
                <a className="ghost-btn" href={whatsappLink} target="_blank" rel="noreferrer">
                  <MessageCircle size={15} /> Falar no WhatsApp
                </a>
              ) : null}
            </article>

            <article className="business-side-panel">
              <div className="business-map-wrap">
                <iframe title={`Mapa ${businessName}`} src={mapEmbedSrc} loading="lazy" />
              </div>

              <div className="business-side-block">
                <h3>Endereço</h3>
                <p className="business-address-line">
                  <MapPin size={14} />
                  {address}
                </p>
              </div>

              <div className="business-side-block">
                <h3>Contato</h3>
                {contactPhone ? (
                  <div className="contact-actions">
                    <a href={`tel:${contactPhone}`}>
                      <Phone size={14} /> {contactPhone}
                    </a>
                    {whatsappLink ? (
                      <a href={whatsappLink} target="_blank" rel="noreferrer">
                        <MessageCircle size={14} /> WhatsApp <ExternalLink size={12} />
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted">Contato em atualização</p>
                )}
              </div>

              <div className="business-side-block">
                <h3>Equipe</h3>
                {workers.length === 0 ? <p className="muted">Equipe em atualização.</p> : null}
                <div className="business-side-workers">
                  {workers.slice(0, 8).map((worker) => (
                    <div key={worker.id ?? worker.nome} className="business-side-worker">
                      {workerPhoto(worker) ? (
                        <img src={workerPhoto(worker)} alt="" />
                      ) : (
                        <span className="worker-initial" aria-hidden="true">{String(worker.nome ?? "P").slice(0, 1).toUpperCase()}</span>
                      )}
                      <span>{worker.nome ?? "Profissional"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {amenities.length > 0 ? (
                <div className="business-side-block">
                  <h3>Comodidades</h3>
                  <div className="business-amenities">
                    {amenities.map((amenity) => <span key={amenity}>{amenity}</span>)}
                  </div>
                </div>
              ) : null}
            </article>
          </aside>
        </div>
      </section>

      <div className="business-mobile-cta">
        <div>
          <strong>{startingPrice > 0 ? `A partir de ${formatMoney(startingPrice)}` : businessName}</strong>
          {ratingLabel ? <span><Star size={12} /> {ratingLabel} · {reviewSummary.count} avaliações</span> : null}
        </div>
        <button className="cta-btn" type="button" onClick={scrollToServices}>
          Agendar
        </button>
      </div>

      <BookingDialog
        isOpen={bookingOpen}
        businessId={businessId}
        initialServiceId={bookingServiceId}
        onClose={() => setBookingOpen(false)}
        onSuccess={handleBookingSuccess}
      />
      {schedulesDialogOpen ? (
        <BusinessSchedulesDialog
          isOpen
          onClose={() => setSchedulesDialogOpen(false)}
          businessId={businessId}
          businessName={businessName}
        />
      ) : null}
    </MarketplaceLayout>
  );
}
