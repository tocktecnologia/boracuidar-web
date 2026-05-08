import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  Search,
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

function useBusinessRouteState() {
  const { search } = useLocation();
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

export default function MarketplaceBusinessPage() {
  const { businessId, redirectToServices } = useBusinessRouteState();
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
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [serviceQuery, setServiceQuery] = useState("");

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

  function handleBookingSuccess(agendamentoId) {
    navigate(
      `/marketplace/confirmation?agendamentoId=${encodeURIComponent(agendamentoId)}&businessId=${encodeURIComponent(businessId)}`,
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
  const address = firstText([page?.address, business.endereco, page?.city, business.cidade]) ?? "Endereco em atualizacao";
  const cityLabel = firstText([business.cidade, page?.city]);
  const mapQuery = encodeURIComponent(`${businessName} ${address}`);
  const mapEmbedSrc = `https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
  const hoursLabel =
    firstText([page?.opening_hours, page?.hours_text, business?.horario_funcionamento]) ??
    "Consulte os horarios disponiveis no agendamento.";
  const selectedPhotoIndex = activePhotoIndex < gallery.length ? activePhotoIndex : 0;
  const activePhoto = gallery[selectedPhotoIndex] ?? cover;

  return (
    <MarketplaceLayout hideTopbar fullWidth>
      <section className="business-profile-wrap">
        <motion.header className="business-profile-head" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="business-profile-brand">
            <img
              src={firstText([page?.logo_url, business.logo_url]) || "/assets/brand/icon-mark.png"}
              alt={businessName}
              className="business-profile-logo"
            />
            <div>
              <h1>{businessName}</h1>
              <p className="business-address-line">
                <MapPin size={14} />
                {address}
              </p>
              <div className="business-profile-meta">
                <span>
                  <Star size={14} />
                  {reviewSummary.count > 0
                    ? `${reviewSummary.average.toFixed(1)} (${reviewSummary.count} avaliacoes)`
                    : "Sem avaliacoes"}
                </span>
                <span>
                  <CheckCircle2 size={14} />
                  Bora Cuidar
                </span>
                {cityLabel ? <span>{cityLabel}</span> : null}
              </div>
            </div>
          </div>

          <div className="business-profile-head-actions">
            <button className="cta-btn business-book-now-btn" onClick={() => openBooking()}>
              <CalendarClock size={16} /> Agendar agora
            </button>
            <Link className="ghost-btn" to={`/marketplace/meus-agendamentos?businessId=${encodeURIComponent(businessId)}`}>
              Meus agendamentos
            </Link>
          </div>
        </motion.header>

        <div className="business-profile-grid">
          <main className="business-main-column">
            <motion.section className="business-gallery-stage" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}>
              <img src={activePhoto} alt={businessName} className="business-stage-photo" />
              <div className="business-stage-overlay" />
              <div className="business-stage-caption">
                <h2>{description}</h2>
                <button className="cta-btn" onClick={() => openBooking()}>
                  <CalendarClock size={15} /> Agendar
                </button>
              </div>
            </motion.section>

            <motion.div
              className="business-gallery-thumbs"
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { staggerChildren: 0.04 } },
              }}
            >
              {gallery.map((imageUrl, index) => (
                <motion.button
                  key={`${imageUrl}-${index}`}
                  type="button"
                  className={index === selectedPhotoIndex ? "business-thumb active" : "business-thumb"}
                  onClick={() => setActivePhotoIndex(index)}
                  variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                >
                  <img src={imageUrl} alt={`${businessName} ${index + 1}`} />
                </motion.button>
              ))}
            </motion.div>

            <section className="business-services-panel">
              <div className="business-services-head">
                <h2>Servicos</h2>
                <label className="business-service-search">
                  <Search size={14} />
                  <input
                    value={serviceQuery}
                    onChange={(event) => setServiceQuery(event.target.value)}
                    placeholder="Buscar servico"
                  />
                </label>
              </div>

              {filteredServices.length === 0 ? <p className="muted">Nenhum servico encontrado.</p> : null}

              {filteredServices.map((service) => (
                <article className="business-service-row" key={service.id}>
                  <div>
                    <strong>{service.nome ?? "Servico"}</strong>
                    <p>{service.descricao ?? "Atendimento especializado"}</p>
                  </div>
                  <div className="business-service-row-actions">
                    <span>{formatMoney(service.preco || 0)}</span>
                    <small>{toInt(service.duracao_minutos) ?? 30} min</small>
                    <button className="cta-btn" onClick={() => openBooking(service.id)}>
                      Agendar
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <section className="business-reviews-panel">
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
            </section>
          </main>

          <motion.aside className="business-side-column" initial={{ opacity: 0, x: 22 }} animate={{ opacity: 1, x: 0 }}>
            <article className="business-side-panel">
              <div className="business-map-wrap">
                <iframe title={`Mapa ${businessName}`} src={mapEmbedSrc} loading="lazy" />
              </div>

              <div className="business-side-block">
                <h3>Sobre</h3>
                <p>{description}</p>
              </div>

              <div className="business-side-block">
                <h3>Equipe</h3>
                {workers.length === 0 ? <p className="muted">Equipe em atualizacao.</p> : null}
                <div className="business-side-workers">
                  {workers.slice(0, 8).map((worker) => (
                    <div key={worker.id ?? worker.nome} className="business-side-worker">
                      {workerPhoto(worker) ? <img src={workerPhoto(worker)} alt={worker.nome ?? "Profissional"} /> : <UserRound size={16} />}
                      <span>{worker.nome ?? "Profissional"}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="business-side-block">
                <h3>Horarios</h3>
                <p className="business-hours-line">
                  <Clock3 size={14} />
                  {hoursLabel}
                </p>
              </div>

              <div className="business-side-block">
                <h3>Contato</h3>
                <p>{contactPhone || "Contato em atualizacao"}</p>
                <p>{address}</p>
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
              </div>
            </article>
          </motion.aside>
        </div>
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
