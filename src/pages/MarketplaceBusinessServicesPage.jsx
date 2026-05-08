import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CalendarClock, MapPin, Search } from "lucide-react";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import BookingDialog from "../components/booking/BookingDialog";
import { queryRows } from "../lib/firestore";
import { firstText, formatMoney, toInt } from "../lib/marketplace";

function useBusinessId() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const raw =
    params.get("businessId")?.trim() ??
    params.get("businesId")?.trim() ??
    "";
  if (!raw) return "";
  const normalized = raw.replace(/\/+$/, "");
  if (normalized.toLowerCase().endsWith("/services")) {
    return normalized.slice(0, -9);
  }
  return normalized;
}

function usePrefillFromQuery() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  return {
    name: params.get("name")?.trim() ?? "",
    whatsapp:
      params.get("whatsapp")?.trim() ??
      params.get("whatsap")?.trim() ??
      "",
  };
}

function logoForBusiness(page, business) {
  return firstText([page?.logo_url, business?.logo_url]) || "/assets/brand/icon-mark.png";
}

export default function MarketplaceBusinessServicesPage() {
  const businessId = useBusinessId();
  const prefill = usePrefillFromQuery();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [business, setBusiness] = useState(null);
  const [page, setPage] = useState(null);
  const [services, setServices] = useState([]);
  const [query, setQuery] = useState("");

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
        const [businessRows, serviceRows, pageRows] = await Promise.all([
          queryRows({
            table: "business",
            conditions: [{ field: "id", operator: "eq", value: businessId }],
            limit: 1,
          }),
          queryRows({
            table: "servicos",
            conditions: [
              { field: "business_id", operator: "eq", value: businessId },
              { field: "ativo", operator: "eq", value: true },
            ],
            orders: [{ field: "nome", ascending: true }],
          }),
          queryRows({
            table: "business-page",
            conditions: [{ field: "business_id", operator: "eq", value: businessId }],
            limit: 1,
          }),
        ]);

        if (!mounted) return;

        if (businessRows.length === 0) {
          throw new Error("Estabelecimento nao encontrado.");
        }

        setBusiness(businessRows[0]);
        setServices(serviceRows);
        setPage(pageRows[0] ?? null);
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

  const filteredServices = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return services;
    return services.filter((service) => {
      const name = String(service?.nome ?? "").toLowerCase();
      const description = String(service?.descricao ?? "").toLowerCase();
      return name.includes(term) || description.includes(term);
    });
  }, [query, services]);

  const businessName = firstText([business?.nome, page?.title]) ?? "Estabelecimento";
  const address = firstText([page?.address, business?.endereco, business?.cidade]) ?? "Endereco em atualizacao";

  function openBooking(serviceId) {
    setBookingServiceId(serviceId ?? null);
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
        <p className="section-message">Carregando servicos...</p>
      </MarketplaceLayout>
    );
  }

  if (error || !business) {
    return (
      <MarketplaceLayout hideTopbar fullWidth>
        <div className="section-message">
          <p className="error-text">{error || "Nao foi possivel carregar os servicos."}</p>
          <Link className="ghost-btn" to="/marketplace">
            Voltar ao marketplace
          </Link>
        </div>
      </MarketplaceLayout>
    );
  }

  return (
    <MarketplaceLayout hideTopbar fullWidth>
      <section className="business-services-shortcut">
        <header className="business-services-shortcut-head">
          <div>
            <h1>{businessName}</h1>
            <p className="business-address-line">
              <MapPin size={14} />
              {address}
            </p>
          </div>
          <Link
            className="business-logo-shortcut"
            to={`/marketplace/business?businessId=${encodeURIComponent(businessId)}`}
            aria-label={`Abrir pagina de ${businessName}`}
          >
            <img src={logoForBusiness(page, business)} alt={businessName} />
          </Link>
        </header>

        <section className="business-services-shortcut-list">
          <div className="business-services-shortcut-tools">
            <h2>Servicos disponiveis</h2>
            <label className="business-service-search">
              <Search size={14} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar servico" />
            </label>
          </div>

          {filteredServices.length === 0 ? <p className="muted">Nenhum servico encontrado.</p> : null}

          {filteredServices.map((service) => (
            <article className="business-service-row shortcut" key={service.id}>
              <div>
                <strong>{service.nome ?? "Servico"}</strong>
                <p>{service.descricao ?? "Atendimento especializado"}</p>
              </div>
              <div className="business-service-row-actions">
                <span>{formatMoney(service.preco || 0)}</span>
                <small>{toInt(service.duracao_minutos) ?? 30} min</small>
                <button className="cta-btn" onClick={() => openBooking(service.id)}>
                  <CalendarClock size={14} /> Agendar
                </button>
              </div>
            </article>
          ))}
        </section>
      </section>

      <BookingDialog
        isOpen={bookingOpen}
        businessId={businessId}
        initialServiceId={bookingServiceId}
        initialCustomerName={prefill.name}
        initialCustomerWhatsapp={prefill.whatsapp}
        onClose={() => setBookingOpen(false)}
        onSuccess={handleBookingSuccess}
      />
    </MarketplaceLayout>
  );
}
