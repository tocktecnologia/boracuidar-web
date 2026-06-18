import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import PostHogPageTracker from "./components/analytics/PostHogPageTracker";

const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));
const MarketplaceBusinessPage = lazy(() => import("./pages/MarketplaceBusinessPage"));
const MarketplaceBusinessServicesPage = lazy(() => import("./pages/MarketplaceBusinessServicesPage"));
const MarketplaceServiceBookingPage = lazy(() => import("./pages/MarketplaceServiceBookingPage"));
const MarketplaceBusinessReviewsPage = lazy(() => import("./pages/MarketplaceBusinessReviewsPage"));
const MarketplaceMySchedulesPage = lazy(() => import("./pages/MarketplaceMySchedulesPage"));
const MarketplaceScheduleDetailPage = lazy(() => import("./pages/MarketplaceScheduleDetailPage"));
const MarketplaceConfirmationPage = lazy(() => import("./pages/MarketplaceConfirmationPage"));
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
          <Route path="/" element={<Navigate to="/marketplace" replace />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/marketplace/business" element={<MarketplaceBusinessPage />} />
          <Route path="/marketplace/business/services" element={<MarketplaceBusinessServicesPage />} />
          <Route path="/marketplace/business/services/:serviceId" element={<MarketplaceServiceBookingPage />} />
          <Route path="/marketplace/business/reviews" element={<MarketplaceBusinessReviewsPage />} />
          <Route path="/marketplace/meus-agendamentos" element={<MarketplaceMySchedulesPage />} />
          <Route path="/marketplace/meus-agendamentos/:agendamentoId" element={<MarketplaceScheduleDetailPage />} />
          <Route path="/marketplace/confirmation" element={<MarketplaceConfirmationPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </>
    </Suspense>
  );
}
