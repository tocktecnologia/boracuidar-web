import { useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import {
  DIMENSIONS,
  LAST_TIME_OPTIONS,
  LAST_TIME_QUESTIONS,
  SCORE_LABELS,
  cycleById,
  dimensionById,
} from "../../lib/rotina/catalog";
import { buildPlan, formatInterval, lowestDimensions } from "../../lib/rotina/engine";
import { completeOnboarding, loadDemo, redoRaiox } from "../../lib/rotina/store";
import { DimensionIcon, HabitIcon } from "./RotinaIcon";

const SHOW_DEMO = import.meta.env.VITE_ROTINA_DEMO === "1";

export default function RaioXFlow({ mode = "onboarding", initialScores = null, onDone }) {
  const isRedo = mode === "redo";
  const [step, setStep] = useState(isRedo ? 1 : 0);
  const [scores, setScores] = useState(initialScores ?? {});
  const [name, setName] = useState("");
  const [priorities, setPriorities] = useState(null);
  const [lastTimes, setLastTimes] = useState({});
  const [excluded, setExcluded] = useState({ habits: new Set(), cycles: new Set() });

  const dimCount = DIMENSIONS.length;
  const priorityStep = dimCount + 1;
  const lastTimeStep = dimCount + 2;
  const planStep = dimCount + 3;
  const totalSteps = isRedo ? priorityStep : planStep;

  const chosenPriorities = priorities ?? lowestDimensions(scores, 3);

  const plan = useMemo(() => {
    const days = {};
    Object.entries(lastTimes).forEach(([id, optionId]) => {
      const option = LAST_TIME_OPTIONS.find((o) => o.id === optionId);
      if (option) days[id] = option.daysAgo;
    });
    return buildPlan(chosenPriorities, days);
  }, [chosenPriorities, lastTimes]);

  function answer(dimId, value) {
    setScores((prev) => ({ ...prev, [dimId]: value }));
    window.setTimeout(() => setStep((s) => s + 1), 160);
  }

  function togglePriority(id) {
    const current = chosenPriorities;
    if (current.includes(id)) setPriorities(current.filter((p) => p !== id));
    else if (current.length < 3) setPriorities([...current, id]);
  }

  function toggleExcluded(kind, id) {
    setExcluded((prev) => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [kind]: next };
    });
  }

  function finishRedo() {
    redoRaiox({ scores, priorities: chosenPriorities });
    onDone?.();
  }

  function finishOnboarding() {
    completeOnboarding({
      name,
      scores,
      priorities: chosenPriorities,
      habits: plan.habits.filter((h) => !excluded.habits.has(h.id)),
      cycles: plan.cycles.filter((c) => !excluded.cycles.has(c.id)),
    });
    onDone?.();
  }

  const progress = step === 0 ? 0 : Math.min(1, step / totalSteps);

  return (
    <section className="raiox" aria-live="polite">
      {step > 0 ? (
        <div className="raiox-top">
          <button
            type="button"
            className="raiox-back"
            onClick={() => (isRedo && step === 1 ? onDone?.() : setStep((s) => Math.max(0, s - 1)))}
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="raiox-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="raiox-step-count">
            {Math.min(step, totalSteps)} de {totalSteps}
          </span>
        </div>
      ) : null}

      {step === 0 ? (
        <div className="raiox-intro">
          <p className="market-eyebrow">Minha rotina</p>
          <h1>Seu autocuidado, num lugar só.</h1>
          <p>
            Começa por um Raio-X rápido: você conta como está em cada área da vida e a gente monta uma rotina com lembretes do
            que importa pra você. Leva uns dois minutos.
          </p>
          <ul className="raiox-intro-list">
            <li><Check size={16} /> Check diário de água, treino, sono e o que mais você quiser</li>
            <li><Check size={16} /> Aviso quando chega a hora do corte, do dentista ou do checkup</li>
            <li><Check size={16} /> Agendamento em poucos toques quando você quiser marcar</li>
          </ul>
          <form
            className="raiox-name"
            onSubmit={(event) => {
              event.preventDefault();
              setStep(1);
            }}
          >
            <label htmlFor="raiox-name-input">Como a gente pode te chamar?</label>
            <input
              id="raiox-name-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Seu primeiro nome"
              autoComplete="given-name"
              maxLength={40}
            />
          </form>
          <div className="raiox-actions">
            <button type="button" className="cta-btn raiox-primary" onClick={() => setStep(1)}>
              Fazer meu Raio-X
            </button>
            {SHOW_DEMO ? (
              <button type="button" className="ghost-btn" onClick={() => { loadDemo(); onDone?.(); }}>
                Ver com dados de exemplo
              </button>
            ) : null}
          </div>
          <p className="raiox-footnote">Por enquanto sua rotina fica salva neste aparelho.</p>
        </div>
      ) : null}

      {step >= 1 && step <= dimCount ? (() => {
        const dim = DIMENSIONS[step - 1];
        return (
          <div className="raiox-question" key={dim.id}>
            <span className="raiox-dim-icon"><DimensionIcon id={dim.id} size={22} /></span>
            <p className="raiox-dim-label">{dim.label}</p>
            <h2>{dim.question}</h2>
            <div className="raiox-scale" role="radiogroup" aria-label={dim.question}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={scores[dim.id] === value}
                  className={scores[dim.id] === value ? "raiox-scale-btn active" : "raiox-scale-btn"}
                  onClick={() => answer(dim.id, value)}
                >
                  <span className="raiox-scale-dots" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((dot) => <i key={dot} className={dot <= value ? "on" : ""} />)}
                  </span>
                  {SCORE_LABELS[value]}
                </button>
              ))}
            </div>
          </div>
        );
      })() : null}

      {step === priorityStep ? (
        <div className="raiox-question">
          <h2>Onde você quer começar?</h2>
          <p className="raiox-sub">Escolha até 3 áreas. Já marcamos as que você deu nota mais baixa.</p>
          <div className="raiox-priority-grid">
            {DIMENSIONS.map((dim) => {
              const active = chosenPriorities.includes(dim.id);
              return (
                <button
                  key={dim.id}
                  type="button"
                  aria-pressed={active}
                  className={active ? "raiox-priority active" : "raiox-priority"}
                  onClick={() => togglePriority(dim.id)}
                  disabled={!active && chosenPriorities.length >= 3}
                >
                  <DimensionIcon id={dim.id} />
                  <span>{dim.label}</span>
                  <small>{SCORE_LABELS[scores[dim.id] ?? 0] || "Sem nota"}</small>
                </button>
              );
            })}
          </div>
          <div className="raiox-actions">
            <button
              type="button"
              className="cta-btn raiox-primary"
              disabled={chosenPriorities.length === 0}
              onClick={() => (isRedo ? finishRedo() : setStep(lastTimeStep))}
            >
              {isRedo ? "Salvar Raio-X" : "Continuar"}
            </button>
          </div>
        </div>
      ) : null}

      {!isRedo && step === lastTimeStep ? (
        <div className="raiox-question">
          <h2>Quando foi a última vez?</h2>
          <p className="raiox-sub">Isso ajuda a lembrar você na hora certa. Pode pular o que não souber.</p>
          <div className="raiox-lasttime">
            {LAST_TIME_QUESTIONS.map((id) => {
              const cycle = cycleById(id);
              return (
                <fieldset key={id} className="raiox-lasttime-group">
                  <legend>Você {cycle.verb}...</legend>
                  <div className="raiox-chip-row">
                    {LAST_TIME_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={lastTimes[id] === option.id}
                        className={lastTimes[id] === option.id ? "raiox-chip active" : "raiox-chip"}
                        onClick={() => setLastTimes((prev) => ({ ...prev, [id]: option.id }))}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="raiox-actions">
            <button type="button" className="cta-btn raiox-primary" onClick={() => setStep(planStep)}>
              Ver minha rotina
            </button>
          </div>
        </div>
      ) : null}

      {!isRedo && step === planStep ? (
        <div className="raiox-question">
          <h2>Sua rotina pra começar</h2>
          <p className="raiox-sub">
            Focada em {chosenPriorities.map((id) => dimensionById(id)?.label.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " e $1")}.
            Tire o que não fizer sentido, dá pra mudar depois.
          </p>

          <h3 className="raiox-plan-title">Todo dia</h3>
          <div className="raiox-plan-list">
            {plan.habits.map((habit) => {
              const off = excluded.habits.has(habit.id);
              return (
                <button
                  key={habit.id}
                  type="button"
                  aria-pressed={!off}
                  className={off ? "raiox-plan-item off" : "raiox-plan-item"}
                  onClick={() => toggleExcluded("habits", habit.id)}
                >
                  <span className="raiox-plan-icon"><HabitIcon name={habit.icon} /></span>
                  <span className="raiox-plan-text">
                    <strong>{habit.label}</strong>
                    <small>{habit.period === "week" ? `${habit.target} ${habit.unit} por semana` : habit.kind === "count" ? `${habit.target} ${habit.unit} por dia` : "Todo dia"}</small>
                  </span>
                  <span className="raiox-plan-check" aria-hidden="true">{off ? null : <Check size={14} />}</span>
                </button>
              );
            })}
          </div>

          {plan.cycles.length > 0 ? (
            <>
              <h3 className="raiox-plan-title">Cuidados de tempos em tempos</h3>
              <div className="raiox-plan-list">
                {plan.cycles.map((cycle) => {
                  const off = excluded.cycles.has(cycle.id);
                  return (
                    <button
                      key={cycle.id}
                      type="button"
                      aria-pressed={!off}
                      className={off ? "raiox-plan-item off" : "raiox-plan-item"}
                      onClick={() => toggleExcluded("cycles", cycle.id)}
                    >
                      <span className="raiox-plan-icon"><DimensionIcon id={cycle.dim} /></span>
                      <span className="raiox-plan-text">
                        <strong>{cycle.label}</strong>
                        <small>A cada {formatInterval(cycle.intervalDays)}</small>
                      </span>
                      <span className="raiox-plan-check" aria-hidden="true">{off ? null : <Check size={14} />}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          <div className="raiox-actions">
            <button type="button" className="cta-btn raiox-primary" onClick={finishOnboarding}>
              Começar minha rotina
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
