import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CalendarClock, MapPin } from "lucide-react";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import BookingDialog from "../components/booking/BookingDialog";
import { queryRows } from "../lib/firestore";
import { firstText } from "../lib/marketplace";

function serviceIdCandidates(rawServiceId) {
  const text = String(rawServiceId ?? "").trim();
  if (!text) return [];
  if (/^\d+$/.test(text)) return [Number(text), text];
  return [text];
}

function usePrefillFromQuery() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  return {
    name: params.get("name")?.trim() ?? "",
    whatsapp: params.get("whatsapp")?.trim() ?? "",
  };
}

export default function MarketplaceServiceBookingPage() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const prefill = usePrefillFromQuery();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [service, setService] = useState(null);
  const [business, setBusiness] = useState(null);
  const [page, setPage] = useState(null);
  const [bookingOpen, setBookingOpen] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const candidates = serviceIdCandidates(serviceId);
        if (candidates.length === 0) {
          throw new Error("service_id ausente na URL.");
        }

        let serviceRows = [];
        for (const candidate of candidates) {
          serviceRows = await queryRows({
            table: "servicos",
            conditions: [{ field: "id", operator: "eq", value: candidate }],
            limit: 1,
          });
          if (serviceRows.length > 0) break;
        }

        if (serviceRows.length === 0) {
          throw new Error("Servico nao encontrado.");
        }

        const currentService = serviceRows[0];
        const businessId = String(currentService.business_id ?? "").trim();
        if (!businessId) {
          throw new Error("Servico sem business_id.");
        }

        const [businessRows, pageRows] = await Promise.all([
          queryRows({
            table: "business",
            conditions: [{ field: "id", operator: "eq", value: businessId }],
            limit: 1,
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

        setService(currentService);
        setBusiness(businessRows[0]);
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
  }, [serviceId]);

  const businessId = String(service?.business_id ?? "").trim();
  const businessName = firstText([business?.nome, page?.title]) ?? "Estabelecimento";
  const address = firstText([page?.address, business?.endereco, business?.cidade]) ?? "Endereco em atualizacao";
  const logoUrl = firstText([page?.logo_url, business?.logo_url]) || "/assets/brand/icon-mark.png";
  const serviceName = firstText([service?.nome]) ?? "Servico";

  const closeTarget = useMemo(() => {
    if (!businessId) return "/marketplace";
    return `/marketplace/business/services?businessId=${encodeURIComponent(businessId)}`;
  }, [businessId]);

  function handleBookingSuccess(agendamentoId) {
    navigate(
      `/marketplace/confirmation?agendamentoId=${encodeURIComponent(agendamentoId)}&businessId=${encodeURIComponent(businessId)}`,
    );
  }

  if (loading) {
    return (
      <MarketplaceLayout hideTopbar fullWidth>
        <p className="section-message">Carregando agendamento do servico...</p>
      </MarketplaceLayout>
    );
  }

  if (error || !service || !business) {
    return (
      <MarketplaceLayout hideTopbar fullWidth>
        <div className="section-message">
          <p className="error-text">{error || "Nao foi possivel abrir este agendamento."}</p>
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
            <p className="muted">Agendamento direto para: {serviceName}</p>
          </div>
          <Link
            className="business-logo-shortcut"
            to={`/marketplace/business?businessId=${encodeURIComponent(businessId)}`}
            aria-label={`Abrir pagina de ${businessName}`}
          >
            <img src={logoUrl} alt={businessName} />
          </Link>
        </header>

        {!bookingOpen ? (
          <div className="business-services-shortcut-list">
            <button className="cta-btn" type="button" onClick={() => setBookingOpen(true)}>
              <CalendarClock size={16} /> Abrir agendamento novamente
            </button>
          </div>
        ) : null}
      </section>

      <BookingDialog
        isOpen={bookingOpen}
        businessId={businessId}
        initialServiceId={service.id}
        initialCustomerName={prefill.name}
        initialCustomerWhatsapp={prefill.whatsapp}
        onClose={() => {
          setBookingOpen(false);
          navigate(closeTarget, { replace: true });
        }}
        onSuccess={handleBookingSuccess}
      />
    </MarketplaceLayout>
  );
}
