import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Search, Star } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useRotina } from "../lib/rotina/store";
import { cycleStatus } from "../lib/rotina/engine";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import { queryCollectionGroupRows, queryRows } from "../lib/firestore";
import {
  coverFromPageOrBusiness,
  evaluationSummary,
  extractPageFromBusiness,
  firstText,
  formatMoney,
  toBool,
  toNumber,
  typeLabel,
} from "../lib/marketplace";

function publicBusinessPath({ id, alias }) {
  const normalizedAlias = String(alias ?? "").trim();
  return normalizedAlias
    ? `/${encodeURIComponent(normalizedAlias)}`
    : `/marketplace/business?businessId=${encodeURIComponent(id)}`;
}

function minimumPrice(services) {
  const values = services.map((service) => toNumber(service.preco)).filter((price) => price > 0);
  if (values.length === 0) return 0;
  return Math.min(...values);
}

function summaryFromRows(rows) {
  return evaluationSummary(rows ?? []);
}

export default function MarketplacePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [businesses, setBusinesses] = useState([]);

  const [searchService, setSearchService] = useState("");
  const [searchWhere, setSearchWhere] = useState("");
  const [searchParams] = useSearchParams();
  const rotina = useRotina();
  const rotinaDue = (rotina.cycles ?? [])
    .map((cycle) => ({ cycle, status: cycleStatus(cycle) }))
    .filter(({ cycle, status }) => cycle.category && ["late", "due"].includes(status.tone))
    .slice(0, 4);
  const initialCategory = searchParams.get("categoria") || "Todos";
  const fromRotina = searchParams.get("origem") === "rotina";
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [appliedFilters, setAppliedFilters] = useState({
    service: "",
    where: "",
    category: initialCategory,
  });

  const carouselRef = useRef(null);
  const filteredCardsRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const [businessRows, serviceRows, pageRows, fallbackPageRows] = await Promise.all([
          queryRows({
            table: "business",
            conditions: [{ field: "ativo", operator: "eq", value: true }],
            orders: [{ field: "nome", ascending: true }],
          }),
          queryRows({
            table: "servicos",
            conditions: [{ field: "ativo", operator: "eq", value: true }],
          }),
          queryCollectionGroupRows({ collectionName: "page" }),
          queryRows({ table: "business-page" }),
        ]);

        if (!mounted) return;

        const servicesByBusiness = {};
        for (const service of serviceRows) {
          const key = String(service.business_id ?? "").trim();
          if (!key) continue;
          if (!servicesByBusiness[key]) servicesByBusiness[key] = [];
          servicesByBusiness[key].push(service);
        }

        const pagesByBusiness = {};
        for (const page of pageRows) {
          const businessId = String(page.business_id ?? page.id ?? "").trim();
          if (!businessId) continue;
          pagesByBusiness[businessId] = page;
        }
        for (const page of fallbackPageRows) {
          const businessId = String(page.business_id ?? page.id ?? "").trim();
          if (!businessId || pagesByBusiness[businessId]) continue;
          pagesByBusiness[businessId] = page;
        }
        // The editor publishes the canonical page inside the business
        // document. Legacy page collections are used only as a fallback.
        for (const business of businessRows) {
          const businessId = String(business.id ?? "").trim();
          if (!businessId) continue;
          const inlinePage = extractPageFromBusiness(business);
          if (inlinePage) pagesByBusiness[businessId] = inlinePage;
        }

        const parsed = [];
        for (let index = 0; index < businessRows.length; index += 1) {
          const business = businessRows[index];
          const businessId = String(business.id ?? "").trim();
          if (!businessId) continue;

          const page = pagesByBusiness[businessId];
          const allowPage = toBool(page?.allow_page) || toBool(business.allow_page);
          if (!allowPage) continue;

          const currentServices = servicesByBusiness[businessId] ?? [];
          const reviews = summaryFromRows(
            business.evalutations ?? business.evaluations ?? business.avaliacoes ?? page?.evaluations ?? page?.avaliacoes,
          );

          parsed.push({
            id: businessId,
            alias: String(business.business_alias ?? "").trim(),
            name: firstText([business.nome, page?.title]) ?? "Estabelecimento",
            category: typeLabel(business.business_type),
            city: firstText([business.cidade, page?.city]) ?? "",
            state: firstText([business.estado, page?.state]) ?? "",
            address: firstText([page?.address, business.endereco]) ?? "Endereço em atualização",
            description:
              firstText([page?.about, page?.short_description, page?.tagline, business.descricao]) ??
              "Especialistas prontos para te atender com agendamento online.",
            coverUrl: coverFromPageOrBusiness(page, business, index),
            rating: toNumber(business.average_stars || page?.average_rating || reviews.average),
            reviewsCount: Number(business.reviews_count || page?.reviews_count || reviews.count || 0),
            startingPrice: minimumPrice(currentServices),
            servicesCount: currentServices.length,
            featured: toBool(page?.featured ?? page?.is_featured ?? business.featured ?? business.is_featured ?? true),
          });
        }

        setBusinesses(parsed);
      } catch (loadError) {
        if (!mounted) return;
        setError(`Falha ao carregar marketplace: ${loadError.message}`);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  const categories = useMemo(() => {
    const values = new Set(["Todos"]);
    businesses.forEach((item) => values.add(item.category));
    return Array.from(values);
  }, [businesses]);
  const heroCategories = useMemo(() => {
    const fastOptions = ["Todos", ...categories.filter((item) => item !== "Todos")];
    if (initialCategory !== "Todos" && !fastOptions.includes(initialCategory)) fastOptions.splice(1, 0, initialCategory);
    return fastOptions.slice(0, 9);
  }, [categories, initialCategory]);

  const featuredBusinesses = useMemo(() => businesses.filter((item) => item.featured), [businesses]);

  useEffect(() => {
    if (loading || !fromRotina || initialCategory === "Todos") return;
    requestAnimationFrame(() => filteredCardsRef.current?.scrollIntoView({ block: "start" }));
  }, [loading, initialCategory, fromRotina]);

  const filteredBusinesses = useMemo(() => {
    const serviceQuery = appliedFilters.service.trim().toLowerCase();
    const whereQuery = appliedFilters.where.trim().toLowerCase();

    return businesses.filter((item) => {
      if (appliedFilters.category !== "Todos" && item.category !== appliedFilters.category) return false;

      if (serviceQuery) {
        const serviceHaystack = `${item.name} ${item.description} ${item.category}`.toLowerCase();
        if (!serviceHaystack.includes(serviceQuery)) return false;
      }

      if (whereQuery) {
        const whereHaystack = `${item.city} ${item.state} ${item.address}`.toLowerCase();
        if (!whereHaystack.includes(whereQuery)) return false;
      }

      return true;
    });
  }, [businesses, appliedFilters]);

  function moveCarousel(direction) {
    const container = carouselRef.current;
    if (!container) return;

    const card = container.querySelector(".estab-carousel-card");
    const cardWidth = card ? card.getBoundingClientRect().width : 280;
    const gap = 12;
    container.scrollBy({ left: direction * (cardWidth + gap), behavior: "smooth" });
  }

  function handleApplyFilters(event) {
    event.preventDefault();
    setAppliedFilters({
      service: searchService,
      where: searchWhere,
      category: selectedCategory,
    });

    requestAnimationFrame(() => {
      filteredCardsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderCard(item, withDescription = false) {
    const location = item.city ? `${item.city}${item.state ? ` · ${item.state}` : ""}` : item.address;
    return (
      <article className={withDescription ? "estab-grid-card" : "estab-carousel-card"}>
        <div className="carousel-cover-wrap">
          <img src={item.coverUrl} alt={item.name} className="carousel-card-cover" loading="lazy" />
        </div>
        <div className="estab-card-body">
          <div className="estab-card-title-row">
            <h3>{item.name}</h3>
            {item.reviewsCount > 0 ? (
              <span className="carousel-rating-pill" aria-label={`Nota ${item.rating.toFixed(1)} de 5`}>
                <Star size={13} className="rating-pill-star" />
                <span>{item.rating.toFixed(1).replace(".", ",")}</span>
                <small>({item.reviewsCount})</small>
              </span>
            ) : (
              <span className="estab-new-badge">Novo</span>
            )}
          </div>
          <p className="market-address">
            {item.category ? <span>{item.category}</span> : null}
            {item.category && location ? <span aria-hidden="true"> · </span> : null}
            {location}
          </p>
          {withDescription && item.description ? <p className="market-description">{item.description}</p> : null}
          <p className="price-from">
            {item.startingPrice > 0 ? <>A partir de <strong>{formatMoney(item.startingPrice)}</strong></> : "Consulte valores"}
          </p>
        </div>
      </article>
    );
  }

  return (
    <MarketplaceLayout fullWidth heroTopbar showFooter>
      <section className="market-search-hero">
        <div className="market-hero-inner">
          <div className="market-headline">
            <p className="market-eyebrow">Beleza, saúde e bem-estar</p>
            <h1>
              Marque um horário <span>com você.</span>
            </h1>
            <p>Encontre barbearias, salões, clínicas e profissionais perto de você e agende online em poucos toques.</p>

            <form className="booksy-search-panel" onSubmit={handleApplyFilters} role="search">
              <div className="search-cell wide">
                <label htmlFor="market-search-service"><Search size={16} /></label>
                <input
                  id="market-search-service"
                  value={searchService}
                  onChange={(event) => setSearchService(event.target.value)}
                  placeholder="Serviço ou estabelecimento"
                  aria-label="Serviço ou estabelecimento"
                />
              </div>
              <div className="search-cell">
                <label htmlFor="market-search-where"><MapPin size={16} /></label>
                <input
                  id="market-search-where"
                  value={searchWhere}
                  onChange={(event) => setSearchWhere(event.target.value)}
                  placeholder="Cidade ou bairro"
                  aria-label="Cidade ou bairro"
                />
              </div>
              <button className="search-submit-btn" type="submit">Buscar</button>
            </form>
          </div>

          <div className="market-headline-media" aria-hidden="true">
            <img src="/assets/brand/site-hero.png" alt="" className="market-headline-image" />
          </div>
        </div>
      </section>

      <div className="market-content-shell">
        <div className="hero-quick-cats" role="tablist" aria-label="Categorias">
          {heroCategories.map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={appliedFilters.category === category}
              className={appliedFilters.category === category ? "hero-cat-btn active" : "hero-cat-btn"}
              onClick={() => {
                setSelectedCategory(category);
                setAppliedFilters((prev) => ({ ...prev, category }));
              }}
            >
              {category}
            </button>
          ))}
        </div>

        {rotinaDue.length > 0 ? (
          <section className="explore-rotina-strip" aria-label="Da sua rotina">
            <p className="explore-rotina-title">Da sua rotina</p>
            <div className="explore-rotina-items">
              {rotinaDue.map(({ cycle, status }) => (
                <button
                  key={cycle.id}
                  type="button"
                  className={appliedFilters.category === cycle.category ? "explore-rotina-item active" : "explore-rotina-item"}
                  onClick={() => {
                    setSelectedCategory(cycle.category);
                    setAppliedFilters((prev) => ({ ...prev, category: cycle.category }));
                    requestAnimationFrame(() => filteredCardsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                  }}
                >
                  <strong>{cycle.label}</strong>
                  <small className={`status-text ${status.tone}`}>{status.label}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {loading ? <p className="section-message">Carregando estabelecimentos...</p> : null}
        {error ? <p className="error-text section-message">{error}</p> : null}

        {!loading && !error ? (
          <section className="market-list-section">
            <div className="list-header">
              <div>
                <h2>Em destaque</h2>
                <p>Lugares bem avaliados para agendar hoje.</p>
              </div>
              <div className="carousel-arrows">
                <button className="carousel-arrow" onClick={() => moveCarousel(-1)} aria-label="Anterior" type="button">
                  <ChevronLeft size={18} />
                </button>
                <button className="carousel-arrow" onClick={() => moveCarousel(1)} aria-label="Próximo" type="button">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {featuredBusinesses.length === 0 ? (
              <p className="section-message">Nenhum estabelecimento em destaque no momento.</p>
            ) : (
              <div className="estab-carousel" ref={carouselRef}>
                {featuredBusinesses.map((item) => (
                  <Link key={item.id} className="estab-carousel-card-link" to={publicBusinessPath(item)}>
                    {renderCard(item)}
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {!loading && !error ? (
          <section className="market-grid-section" ref={filteredCardsRef}>
            <div className="list-header">
              <div>
                <h2>{appliedFilters.category === "Todos" ? "Todos os estabelecimentos" : appliedFilters.category}</h2>
                <p>{filteredBusinesses.length} {filteredBusinesses.length === 1 ? "resultado" : "resultados"}</p>
              </div>
            </div>

            {filteredBusinesses.length === 0 ? (
              <div className="section-message">
                <p>
                  {appliedFilters.category !== "Todos"
                    ? `Ainda não temos ${appliedFilters.category.toLowerCase()} disponível por aqui.`
                    : "Nenhum estabelecimento encontrado para os filtros informados."}
                </p>
                {appliedFilters.category !== "Todos" ? (
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setSelectedCategory("Todos");
                      setAppliedFilters((prev) => ({ ...prev, category: "Todos" }));
                    }}
                  >
                    Ver todos os estabelecimentos
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="market-cards-grid">
                {filteredBusinesses.map((item) => (
                  <Link key={item.id} className="estab-grid-card-link" to={publicBusinessPath(item)}>
                    {renderCard(item, true)}
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {!loading && !error ? (
          <>
            <section className="market-business-cta">
              <div>
                <p className="market-eyebrow">Para negócios</p>
                <h2>Seu negócio na agenda de quem quer se cuidar.</h2>
                <p>Página própria, agendamento 24 horas e lembretes automáticos pelo WhatsApp. Grátis para começar.</p>
              </div>
              <div className="market-business-cta-actions">
                <a href="https://business.boracuidar.app/signup" className="market-signup-btn">Cadastrar meu negócio</a>
                <a href="https://boracuidar.app/signin" className="market-signin-btn">Já tenho conta</a>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </MarketplaceLayout>
  );
}
