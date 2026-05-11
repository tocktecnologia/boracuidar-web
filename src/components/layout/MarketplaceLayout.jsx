import { Link } from "react-router-dom";

export default function MarketplaceLayout({ children, hideTopbar = false, fullWidth = false, heroTopbar = false }) {
  return (
    <div className={heroTopbar ? "app-shell hero-topbar-shell" : "app-shell"}>
      {!hideTopbar ? (
        <header className={heroTopbar ? "topbar hero-topbar" : "topbar"}>
          <Link to="/marketplace" className="brand-left" aria-label="Bora Cuidar Marketplace">
            <img src="/assets/brand/icon-mark.png" alt="Bora Cuidar" className="brand-mark" />
            <span>Bora Cuidar</span>
          </Link>
          <div className="topbar-actions">
            <a className="about-btn" href="https://business.boracuidar.app">
              Sobre
            </a>
            <a className="signin-btn" href="https://business.boracuidar.app/signin">
              Entrar
            </a>
          </div>
        </header>
      ) : null}
      <main className={fullWidth ? "main-shell full" : "main-shell"}>{children}</main>
    </div>
  );
}
