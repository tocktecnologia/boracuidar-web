import { Navigate, Route, Routes } from "react-router-dom";
import MarketplacePage from "./pages/MarketplacePage";
import MarketplaceBusinessPage from "./pages/MarketplaceBusinessPage";
import MarketplaceBusinessReviewsPage from "./pages/MarketplaceBusinessReviewsPage";
import MarketplaceMySchedulesPage from "./pages/MarketplaceMySchedulesPage";
import MarketplaceConfirmationPage from "./pages/MarketplaceConfirmationPage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/marketplace" replace />} />
      <Route path="/marketplace" element={<MarketplacePage />} />
      <Route path="/marketplace/business" element={<MarketplaceBusinessPage />} />
      <Route path="/marketplace/business/reviews" element={<MarketplaceBusinessReviewsPage />} />
      <Route path="/marketplace/meus-agendamentos" element={<MarketplaceMySchedulesPage />} />
      <Route path="/marketplace/confirmation" element={<MarketplaceConfirmationPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
