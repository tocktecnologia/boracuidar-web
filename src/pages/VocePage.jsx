import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Building2, CalendarDays, ChevronRight, Pencil } from "lucide-react";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import HelpCard from "../components/rotina/HelpCard";
import OnboardingPrompt from "../components/rotina/OnboardingPrompt";
import ProgressTab from "../components/rotina/ProgressTab";
import RaioXFlow from "../components/rotina/RaioXFlow";
import { MOODS } from "../lib/rotina/content";
import { dateKey, formatDayShort, moodSeries } from "../lib/rotina/engine";
import { updateProfile, updateSettings, useRotina } from "../lib/rotina/store";

function MoodMonth({ state }) {
  const series = moodSeries(state, 30, dateKey());
  const logged = series.filter((d) => d.score != null);
  const avg = logged.length ? logged.reduce((s, d) => s + d.score, 0) / logged.length : null;
  const avgLabel = avg ? MOODS[Math.round(avg) - 1]?.label : null;
  return (
    <section className="rotina-panel">
      <div className="rotina-panel-head">
        <h3>Seu humor nos últimos 30 dias</h3>
        <small className="muted">{logged.length} registros</small>
      </div>
      {logged.length === 0 ? (
        <p className="muted">Marque como você está na tela de Início pra acompanhar aqui.</p>
      ) : (
        <>
          <div className="mood-month" role="img" aria-label={`Humor médio: ${avgLabel}`}>
            {series.map((d) => (
              <span key={d.key} className={d.score ? `mood-bar m${d.score}` : "mood-bar empty"} style={{ height: d.score ? `${d.score * 20}%` : "6%" }} title={`${formatDayShort(d.key)}${d.score ? `: ${MOODS[d.score - 1].label}` : ""}`} />
            ))}
          </div>
          <div className="mood-month-axis"><small>{formatDayShort(series[0].key)}</small><small>Hoje</small></div>
          <p className="mood-month-summary">Na média, você esteve <strong>{avgLabel?.toLowerCase()}</strong>.</p>
        </>
      )}
    </section>
  );
}

function ReminderSettings({ state }) {
  const settings = state.settings ?? {};
  return (
    <section className="rotina-panel">
      <div className="rotina-panel-head">
        <h3><Bell size={15} aria-hidden="true" /> Lembretes</h3>
      </div>
      <div className="settings-grid">
        <label htmlFor="set-morning">Resumo da manhã</label>
        <input id="set-morning" type="time" value={settings.reminderTime ?? "08:00"} onChange={(e) => updateSettings({ reminderTime: e.target.value })} />
        <label htmlFor="set-evening">Fechamento do dia</label>
        <input id="set-evening" type="time" value={settings.eveningTime ?? "21:00"} onChange={(e) => updateSettings({ eveningTime: e.target.value })} />
      </div>
      <label className="switch-row" htmlFor="set-weekend">
        <span><strong>Fim de semana mais leve</strong><small>Só lembretes de cuidados que vencem</small></span>
        <input id="set-weekend" type="checkbox" checked={Boolean(settings.quietWeekend)} onChange={(e) => updateSettings({ quietWeekend: e.target.checked })} />
      </label>
      <label className="switch-row" htmlFor="set-whatsapp">
        <span><strong>Receber pelo WhatsApp</strong><small>Em breve. Você responde "feito" e o hábito é marcado.</small></span>
        <input id="set-whatsapp" type="checkbox" checked={Boolean(settings.whatsapp)} onChange={(e) => updateSettings({ whatsapp: e.target.checked })} />
      </label>
    </section>
  );
}

export default function VocePage() {
  const state = useRotina();
  const [redo, setRedo] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(state.profile?.name ?? "");

  if (redo) {
    return (
      <MarketplaceLayout fullWidth hideTabBar>
        <div className="rotina-shell narrow">
          <RaioXFlow mode="redo" initialScores={state.raiox?.scores} onDone={() => { setRedo(false); window.scrollTo({ top: 0 }); }} />
        </div>
      </MarketplaceLayout>
    );
  }

  const displayName = state.profile?.name?.trim();

  return (
    <MarketplaceLayout fullWidth>
      <div className="rotina-shell">
        <header className="profile-head">
          <span className="profile-avatar" aria-hidden="true">{(displayName || "V").slice(0, 1).toUpperCase()}</span>
          <div>
            {editingName ? (
              <form
                className="profile-name-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateProfile({ name: name.trim() });
                  setEditingName(false);
                }}
              >
                <label htmlFor="profile-name" className="sr-only">Seu nome</label>
                <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
                <button type="submit" className="ghost-btn small">Salvar</button>
              </form>
            ) : (
              <h1>
                {displayName || "Você"}
                <button type="button" className="icon-text-btn" onClick={() => setEditingName(true)} aria-label="Editar nome"><Pencil size={14} /></button>
              </h1>
            )}
            <p>{state.createdAt ? `Cuidando de si com o BoraCuidar desde ${formatDayShort(state.createdAt)}` : "Comece pelo Raio-X na tela de Início"}</p>
          </div>
        </header>

        {state.onboarded ? (
          <ProgressTab state={state} onRedoRaiox={() => { setRedo(true); window.scrollTo({ top: 0 }); }}>
            <div className="progress-grid">
              <MoodMonth state={state} />
              <ReminderSettings state={state} />
            </div>
          </ProgressTab>
        ) : (
          <OnboardingPrompt title="Seu progresso aparece aqui" text="Depois do Raio-X, você acompanha sua evolução, conquistas e humor nesta tela." />
        )}

        <section className="rotina-panel profile-links">
          <Link to="/marketplace/meus-agendamentos" className="profile-link">
            <CalendarDays size={18} aria-hidden="true" /><span>Meus agendamentos</span><ChevronRight size={18} aria-hidden="true" />
          </Link>
          <a href="https://business.boracuidar.app" className="profile-link">
            <Building2 size={18} aria-hidden="true" /><span>BoraCuidar para negócios</span><ChevronRight size={18} aria-hidden="true" />
          </a>
        </section>

        <HelpCard />
      </div>
    </MarketplaceLayout>
  );
}
