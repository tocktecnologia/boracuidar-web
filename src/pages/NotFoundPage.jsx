import { Link } from "react-router-dom";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";

export default function NotFoundPage() {
  return (
    <MarketplaceLayout>
      <section className="section-message">
        <h1>Pagina nao encontrada</h1>
        <p className="muted">A rota informada nao existe neste app de marketplace.</p>
        <Link className="cta-btn" to="/marketplace">Ir para marketplace</Link>
      </section>
    </MarketplaceLayout>
  );
}
