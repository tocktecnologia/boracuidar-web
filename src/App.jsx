import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import PostHogPageTracker from "./components/analytics/PostHogPageTracker";

const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));
const MarketplaceBusinessPage = lazy(() => import("./pages/MarketplaceBusinessPage"));
const BusinessAliasPage = lazy(() => import("./pages/BusinessAliasPage"));
const MarketplaceBusinessServicesPage = lazy(() => import("./pages/MarketplaceBusinessServicesPage"));
const MarketplaceServiceBookingPage = lazy(() => import("./pages/MarketplaceServiceBookingPage"));
const MarketplaceBusinessReviewsPage = lazy(() => import("./pages/MarketplaceBusinessReviewsPage"));
const MarketplaceMySchedulesPage = lazy(() => import("./pages/MarketplaceMySchedulesPage"));
const MarketplaceScheduleDetailPage = lazy(() => import("./pages/MarketplaceScheduleDetailPage"));
const MarketplaceConfirmationPage = lazy(() => import("./pages/MarketplaceConfirmationPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const InicioPage = lazy(() => import("./pages/InicioPage"));
const CuidadosPage = lazy(() => import("./pages/CuidadosPage"));
const AprenderPage = lazy(() => import("./pages/AprenderPage"));
const ArtigoPage = lazy(() => import("./pages/ArtigoPage"));
const TrilhaPage = lazy(() => import("./pages/TrilhaPage"));
const VocePage = lazy(() => import("./pages/VocePage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function RouteFallback() {
  return <p className="section-message">Carregando...</p>;
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <>
        <PostHogPageTracker />
        <Routes>
          <Route path="/" element={<InicioPage />} />
          <Route path="/cuidados" element={<CuidadosPage />} />
          <Route path="/aprender" element={<AprenderPage />} />
          <Route path="/aprender/artigo/:slug" element={<ArtigoPage />} />
          <Route path="/aprender/trilha/:slug" element={<TrilhaPage />} />
          <Route path="/voce" element={<VocePage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/marketplace/business" element={<MarketplaceBusinessPage />} />
          <Route path="/marketplace/business/services" element={<MarketplaceBusinessServicesPage />} />
          <Route path="/marketplace/business/services/:serviceId" element={<MarketplaceServiceBookingPage />} />
          <Route path="/marketplace/business/reviews" element={<MarketplaceBusinessReviewsPage />} />
          <Route path="/marketplace/meus-agendamentos" element={<MarketplaceMySchedulesPage />} />
          <Route path="/marketplace/meus-agendamentos/:agendamentoId" element={<MarketplaceScheduleDetailPage />} />
          <Route path="/marketplace/confirmation" element={<MarketplaceConfirmationPage />} />
          <Route path="/minha-rotina" element={<Navigate to="/" replace />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/:businessAlias" element={<BusinessAliasPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </>
    </Suspense>
  );
}
