import { useState } from "react";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import RaioXFlow from "../components/rotina/RaioXFlow";
import TodayTab from "../components/rotina/TodayTab";
import { cycleStatus, dateKey, dayProgress, formatDayLong, greeting, weekStreak } from "../lib/rotina/engine";
import { useRotina } from "../lib/rotina/store";

export default function InicioPage() {
  const state = useRotina();
  const [, setTick] = useState(0);

  if (!state.onboarded) {
    return (
      <MarketplaceLayout fullWidth hideTabBar>
        <div className="rotina-shell narrow">
          <RaioXFlow mode="onboarding" onDone={() => { setTick((t) => t + 1); window.scrollTo({ top: 0 }); }} />
        </div>
      </MarketplaceLayout>
    );
  }

  const today = dateKey();
  const progress = dayProgress(state, today);
  const pct = Math.round(progress * 100);
  const streak = weekStreak(state, today);
  const pending = state.cycles.filter((c) => ["late", "due"].includes(cycleStatus(c, today).tone)).length;
  const name = state.profile?.name?.trim();

  let summary;
  if (pct >= 100) summary = "Rotina de hoje completa.";
  else if (pct > 0) summary = `Você já fez ${pct}% da rotina de hoje.`;
  else summary = "Sua rotina de hoje está esperando por você.";
  if (pending > 0) summary += ` ${pending} ${pending === 1 ? "cuidado pede" : "cuidados pedem"} atenção.`;

  return (
    <MarketplaceLayout fullWidth>
      <div className="rotina-shell">
        <header className="rotina-head">
          <div>
            <p className="rotina-date">{formatDayLong(today)}</p>
            <h1>{greeting()}{name ? `, ${name}` : ""}</h1>
            <p className="rotina-summary">{summary}</p>
          </div>
          <div className="rotina-head-stats">
            <div className="day-ring" style={{ "--p": progress }} role="img" aria-label={`${pct}% da rotina de hoje`}>
              <span><strong>{pct}%</strong><small>hoje</small></span>
            </div>
            {streak > 0 ? (
              <div className="rotina-streak" aria-label={`${streak} semanas seguidas`}>
                <strong>{streak}</strong>
                <span>{streak === 1 ? "semana" : "semanas"}<br />seguidas</span>
              </div>
            ) : null}
          </div>
        </header>
        <div className="rotina-body">
          <TodayTab state={state} />
        </div>
      </div>
    </MarketplaceLayout>
  );
}
