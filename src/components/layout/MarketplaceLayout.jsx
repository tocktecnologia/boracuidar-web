import { Link, NavLink } from "react-router-dom";
import { BookOpen, CalendarCheck, Compass, House, UserRound } from "lucide-react";
import BrandLogo from "../common/BrandLogo";
import { useRotina } from "../../lib/rotina/store";

const NAV = [
  { to: "/", label: "Início", icon: House, end: true },
  { to: "/cuidados", label: "Cuidados", icon: CalendarCheck },
  { to: "/marketplace", label: "Explorar", icon: Compass },
  { to: "/aprender", label: "Aprender", icon: BookOpen },
  { to: "/voce", label: "Você", icon: UserRound },
];

function navClass({ isActive }) {
  return isActive ? "app-nav-link active" : "app-nav-link";
}

export default function MarketplaceLayout({
  children,
  hideTopbar = false,
  fullWidth = false,
  heroTopbar = false,
  showFooter = false,
  hideTabBar = false,
}) {
  const state = useRotina();
  const name = state.profile?.name?.trim();

  return (
    <div className={["app-shell", heroTopbar ? "hero-topbar-shell" : "", hideTabBar || hideTopbar ? "" : "has-tabbar"].join(" ").trim()}>
      {!hideTopbar ? (
        <header className={heroTopbar ? "topbar hero-topbar" : "topbar"}>
          <div className="topbar-inner">
            <Link to="/" className="brand-left" aria-label="BoraCuidar, início">
              <BrandLogo />
            </Link>
            <nav className="app-nav" aria-label="Navegação principal">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="topbar-actions">
              {name ? (
                <Link to="/voce" className="topbar-avatar" aria-label={`Perfil de ${name}`}>
                  {name.slice(0, 1).toUpperCase()}
                </Link>
              ) : (
                <a className="signin-btn" href="https://boracuidar.app/signin">Entrar</a>
              )}
            </div>
          </div>
        </header>
      ) : null}

      <main className={fullWidth ? "main-shell full" : "main-shell"}>{children}</main>

      {showFooter ? (
        <footer className="app-footer">
          <div className="app-footer-inner">
            <div className="app-footer-brand">
              <BrandLogo />
              <p>Onde a gente se cuida.</p>
            </div>
            <div className="app-footer-links">
              <Link to="/">Minha rotina</Link>
              <Link to="/marketplace">Explorar</Link>
              <Link to="/marketplace/meus-agendamentos">Meus agendamentos</Link>
              <a href="https://business.boracuidar.app">Para negócios</a>
            </div>
            <p className="app-footer-legal">© {new Date().getFullYear()} BoraCuidar</p>
          </div>
        </footer>
      ) : null}

      {!hideTabBar && !hideTopbar ? (
        <nav className="app-tabbar" aria-label="Navegação do app">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "app-tab active" : "app-tab")}>
                <Icon size={21} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
