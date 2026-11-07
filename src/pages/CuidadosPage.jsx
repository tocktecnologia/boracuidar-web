import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import CuidadosTab from "../components/rotina/CuidadosTab";
import OnboardingPrompt from "../components/rotina/OnboardingPrompt";
import { useRotina } from "../lib/rotina/store";

export default function CuidadosPage() {
  const state = useRotina();
  return (
    <MarketplaceLayout fullWidth>
      <div className="rotina-shell">
        <header className="page-head">
          <h1>Cuidados</h1>
          <p>O que você faz de tempos em tempos, com aviso na hora certa.</p>
        </header>
        {state.onboarded ? (
          <CuidadosTab state={state} />
        ) : (
          <OnboardingPrompt title="Seus cuidados aparecem aqui" text="Faça o Raio-X pra gente saber quando foi seu último corte, dentista e checkup." />
        )}
      </div>
    </MarketplaceLayout>
  );
}
