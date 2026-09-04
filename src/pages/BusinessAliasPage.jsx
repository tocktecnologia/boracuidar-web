import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import { queryRows } from "../lib/firestore";
import MarketplaceBusinessPage from "./MarketplaceBusinessPage";

export default function BusinessAliasPage() {
  const { businessAlias = "" } = useParams();
  const alias = businessAlias.trim().toLowerCase();

  // Remounting per alias prevents a previously resolved business from being
  // displayed while a new alias is being resolved.
  return <BusinessAliasResolver key={alias} alias={alias} />;
}

function BusinessAliasResolver({ alias }) {
  const [businessId, setBusinessId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function resolveBusiness() {
      if (!alias) {
        if (mounted) setError("Link do estabelecimento invalido.");
        return;
      }

      try {
        const rows = await queryRows({
          table: "business",
          conditions: [{ field: "business_alias", operator: "eq", value: alias }],
          limit: 2,
        });

        if (!mounted) return;
        if (rows.length === 0) {
          setError("Estabelecimento nao encontrado.");
          return;
        }
        if (rows.length > 1) {
          setError("Este link esta associado a mais de um estabelecimento.");
          return;
        }

        setBusinessId(String(rows[0].id ?? "").trim());
      } catch {
        if (mounted) setError("Nao foi possivel abrir este estabelecimento.");
      }
    }

    resolveBusiness();
    return () => {
      mounted = false;
    };
  }, [alias]);

  if (businessId) {
    // The child receives the id only for data loading. The browser location
    // remains /<business_alias> throughout the visit.
    return <MarketplaceBusinessPage businessId={businessId} />;
  }

  if (!error) {
    return (
      <MarketplaceLayout hideTopbar fullWidth>
        <p className="section-message">Carregando estabelecimento...</p>
      </MarketplaceLayout>
    );
  }

  return (
    <MarketplaceLayout hideTopbar fullWidth>
      <div className="section-message">
        <p className="error-text">{error}</p>
        <Link className="ghost-btn" to="/marketplace">Voltar ao marketplace</Link>
      </div>
    </MarketplaceLayout>
  );
}
