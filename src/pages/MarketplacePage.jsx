import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, MapPin, Search, ShieldCheck, Star } from "lucide-react";
import { Link } from "react-router-dom";
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
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [appliedFilters, setAppliedFilters] = useState({
    service: "",
    where: "",
    category: "Todos",
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
        for (const business of businessRows) {
          const businessId = String(business.id ?? "").trim();
          if (!businessId) continue;
          const inlinePage = extractPageFromBusiness(business);
          if (inlinePage) pagesByBusiness[businessId] = inlinePage;
        }
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
            name: firstText([business.nome, page?.title]) ?? "Estabelecimento",
            category: typeLabel(business.business_type),
            city: firstText([business.cidade, page?.city]) ?? "",
            state: firstText([business.estado, page?.state]) ?? "",
            address: firstText([page?.address, business.endereco]) ?? "Endereco em atualizacao",
            description:
              firstText([page?.short_description, page?.tagline, page?.about, business.descricao]) ??
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
    return fastOptions.slice(0, 9);
  }, [categories]);

  const featuredBusinesses = useMemo(() => businesses.filter((item) => item.featured), [businesses]);

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

  const stats = useMemo(() => {
    const servicesTotal = businesses.reduce((sum, item) => sum + item.servicesCount, 0);
    const reviewed = businesses.filter((item) => item.reviewsCount > 0);
    const reviewsTotal = reviewed.reduce((sum, item) => sum + item.reviewsCount, 0);
    const weightedStars = reviewed.reduce((sum, item) => sum + item.rating * item.reviewsCount, 0);
    const averageRating = reviewsTotal > 0 ? weightedStars / reviewsTotal : null;
    const prices = businesses.map((item) => item.startingPrice).filter((value) => value > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : null;

    return {
      businessesTotal: businesses.length,
      servicesTotal,
      averageRating,
      minPrice,
    };
  }, [businesses]);

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

  return (
    <MarketplaceLayout fullWidth heroTopbar>
      <section className="market-search-hero">
        <div className="market-headline with-image">
          <img src="/assets/brand/site-hero.png" alt="Bora Cuidar Marketplace" className="market-headline-image" />
          <div className="market-headline-overlay" />
          <h1>
            Bora Cuidar
            <span>Beleza e bem-estar perto de você</span>
          </h1>
          <p>Descubra servicos, compare opcoes e agende em minutos.</p>
        </div>

        <div className="hero-quick-cats">
          {heroCategories.map((category) => (
            <button
              key={category}
              type="button"
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
      </section>

      <div className="market-content-shell">
      {loading ? <p className="section-message">Carregando marketplace...</p> : null}
        {error ? <p className="error-text section-message">{error}</p> : null}

        {!loading && !error ? (
          <section className="market-list-section">
            <div className="list-header">
              <h2>Estabelecimentos em destaque</h2>
              <div className="carousel-arrows">
                <button className="carousel-arrow" onClick={() => moveCarousel(-1)} aria-label="Anterior" type="button">
                  <ChevronLeft size={18} />
                </button>
                <button className="carousel-arrow" onClick={() => moveCarousel(1)} aria-label="Proximo" type="button">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {featuredBusinesses.length === 0 ? (
              <p className="section-message">Nenhum estabelecimento em destaque no momento.</p>
            ) : (
              <div className="estab-carousel" ref={carouselRef}>
                {featuredBusinesses.map((item) => (
                  <Link
                    key={item.id}
                    className="estab-carousel-card-link"
                    to={`/marketplace/business?businessId=${encodeURIComponent(item.id)}`}
                  >
                    <article className="estab-carousel-card">
                      <div className="carousel-cover-wrap">
                        <img src={item.coverUrl} alt={item.name} className="carousel-card-cover" />
                        {item.reviewsCount > 0 ? (
                          <span className="carousel-rating-pill">
                            <Star size={13} className="rating-pill-star" />
                            <span>{item.rating.toFixed(1)}</span>
                          </span>
                        ) : null}
                      </div>
                      <h3>{item.name}</h3>
                      <p className="market-address">{item.city ? `${item.city}${item.state ? ` - ${item.state}` : ""}` : item.address}</p>
                      <p className="price-from">{item.startingPrice > 0 ? `A partir de ${formatMoney(item.startingPrice)}` : "Consulte valores"}</p>
                    </article>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {!loading && !error ? (
          <section className="market-grid-section" ref={filteredCardsRef}>
            <form className="booksy-search-panel market-estab-filters" onSubmit={handleApplyFilters}>
              <div className="search-cell wide">
                <label><Search size={14} /> Qual servico?</label>
                <input
                  value={searchService}
                  onChange={(event) => setSearchService(event.target.value)}
                  placeholder="Corte, escova, manicure, consulta..."
                />
              </div>
              <div className="search-cell">
                <label><MapPin size={14} /> Onde?</label>
                <input
                  value={searchWhere}
                  onChange={(event) => setSearchWhere(event.target.value)}
                  placeholder="Cidade ou bairro"
                />
              </div>
              <button className="search-submit-btn" type="submit">Buscar</button>
            </form>

            <div className="list-header">
              <h2>Estabelecimentos</h2>
            </div>

            {filteredBusinesses.length === 0 ? (
              <p className="section-message">Nenhum estabelecimento encontrado para os filtros informados.</p>
            ) : (
              <div className="market-cards-grid">
                {filteredBusinesses.map((item) => (
                  <Link
                    key={item.id}
                    className="estab-grid-card-link"
                    to={`/marketplace/business?businessId=${encodeURIComponent(item.id)}`}
                  >
                    <article className="estab-grid-card">
                      <div className="carousel-cover-wrap">
                        <img src={item.coverUrl} alt={item.name} className="carousel-card-cover" />
                        {item.reviewsCount > 0 ? (
                          <span className="carousel-rating-pill">
                            <Star size={13} className="rating-pill-star" />
                            <span>{item.rating.toFixed(1)}</span>
                          </span>
                        ) : null}
                      </div>
                      <h3>{item.name}</h3>
                      <p className="market-address">{item.city ? `${item.city}${item.state ? ` - ${item.state}` : ""}` : item.address}</p>
                      <p className="market-description">{item.description}</p>
                      <p className="price-from">{item.startingPrice > 0 ? `A partir de ${formatMoney(item.startingPrice)}` : "Consulte valores"}</p>
                    </article>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {!loading && !error ? (
          <>
            <section className="market-how-it-works">
              <h2>Como usar o marketplace</h2>
              <div className="market-how-grid">
                <article className="market-how-card">
                  <Search size={18} />
                  <h3>Busque</h3>
                  <p>Digite o servico, cidade ou tipo de atendimento que voce quer.</p>
                </article>
                <article className="market-how-card">
                  <ShieldCheck size={18} />
                  <h3>Compare</h3>
                  <p>Veja perfil, nota, descricao e disponibilidade para decidir rapido.</p>
                </article>
                <article className="market-how-card">
                  <CalendarCheck size={18} />
                  <h3>Reserve</h3>
                  <p>Entre no perfil, escolha o servico e finalize o agendamento em minutos.</p>
                </article>
              </div>
            </section>

            <section className="market-curiosities">
              <h2>Curiosidades do marketplace</h2>
              <div className="market-curiosities-grid">
                <article className="market-stat-card">
                  <strong>{stats.businessesTotal}</strong>
                  <p>Estabelecimentos ativos</p>
                </article>
                <article className="market-stat-card">
                  <strong>{stats.servicesTotal}</strong>
                  <p>Servicos publicados</p>
                </article>
                <article className="market-stat-card">
                  <strong>{stats.averageRating ? stats.averageRating.toFixed(1) : "--"}</strong>
                  <p>Avaliacao media</p>
                </article>
                <article className="market-stat-card">
                  <strong>{stats.minPrice ? formatMoney(stats.minPrice) : "--"}</strong>
                  <p>Faixa inicial</p>
                </article>
              </div>
            </section>

            <section className="market-business-cta">
              <h2>Tem um negocio e quer aparecer aqui?</h2>
              <p>Mostre sua pagina, receba novos clientes e transforme visitas em agendamentos.</p>
              <div className="market-business-cta-actions">
                <a href="https://business.boracuidar.app/signup" className="market-signup-btn">Cadastrar meu negocio</a>
                <a href="https://business.boracuidar.app/signin" className="market-signin-btn">Ja tenho conta</a>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </MarketplaceLayout>
  );
}
