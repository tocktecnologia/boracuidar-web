import { Link, useLocation, useNavigate } from "react-router-dom";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import BookingConfirmationCard from "../components/booking/BookingConfirmationCard";

function useQuery() {
  const { search } = useLocation();
  return new URLSearchParams(search);
}

export default function MarketplaceConfirmationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const query = useQuery();
  const agendamentoId = query.get("agendamentoId") ?? "";
  const businessId = query.get("businessId") ?? "";
  const confirmationPayload = location.state?.confirmationPayload ?? null;

  function goBack() {
    if (businessId) {
      navigate(`/marketplace/business?businessId=${encodeURIComponent(businessId)}`);
      return;
    }
    navigate("/marketplace");
  }

  return (
    <MarketplaceLayout hideTopbar>
      <section className="confirmation-page">
        <BookingConfirmationCard agendamentoId={agendamentoId} onBack={goBack} initialPayload={confirmationPayload} />
        <Link className="ghost-btn" to="/marketplace">Explorar marketplace</Link>
      </section>
    </MarketplaceLayout>
  );
}
