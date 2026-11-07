import { useState } from "react";
import { Award, Lock, RotateCcw } from "lucide-react";
import { DIMENSIONS, SCORE_LABELS, cycleById } from "../../lib/rotina/catalog";
import {
  WEEK_GOAL,
  addDays,
  cycleStatus,
  dateKey,
  formatDayShort,
  parseKey,
  unlockedAchievements,
  weekScore,
  weekStart,
  weekStreak,
} from "../../lib/rotina/engine";
import { resetRotina } from "../../lib/rotina/store";
import RadarChart from "./RadarChart";

function WeeksChart({ state, today }) {
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(today), -7 * (7 - i)));
  const created = state.createdAt ? weekStart(state.createdAt) : weekStart(today);
  return (
    <div className="weeks-chart" role="img" aria-label="Rotina cumprida nas últimas 8 semanas">
      <span className="weeks-goal" style={{ bottom: `calc(22px + (100% - 22px) * ${WEEK_GOAL})` }}>
        <small>meta</small>
      </span>
      {weeks.map((w) => {
        const active = w >= created;
        const score = active ? weekScore(state, w) : 0;
        return (
          <div key={w} className="weeks-col">
            <div className="weeks-track">
              <i className={score >= WEEK_GOAL ? "hit" : ""} style={{ height: `${Math.max(active ? 4 : 0, score * 100)}%` }} />
            </div>
            <small>{w === weekStart(today) ? "Esta" : `${parseKey(w).getDate()}/${parseKey(w).getMonth() + 1}`}</small>
          </div>
        );
      })}
    </div>
  );
}

export default function ProgressTab({ state, onRedoRaiox, children }) {
  const today = dateKey();
  const [confirmReset, setConfirmReset] = useState(false);
  const streak = weekStreak(state, today);
  const thisWeek = Math.round(weekScore(state, weekStart(today)) * 100);
  const cyclesOk = state.cycles.filter((c) => c.lastDate && cycleStatus(c, today).tone !== "late").length;
  const achievements = unlockedAchievements(state, today);
  const history = state.raioxHistory ?? [];
  const previous = history.length > 1 ? history[history.length - 2].scores : null;
  const scores = state.raiox?.scores ?? {};

  return (
    <div className="rotina-progress">
      <div className="progress-stats">
        <article>
          <strong>{streak}</strong>
          <p>{streak === 1 ? "semana seguida" : "semanas seguidas"}</p>
        </article>
        <article>
          <strong>{thisWeek}%</strong>
          <p>da rotina nesta semana</p>
        </article>
        <article>
          <strong>{cyclesOk}/{state.cycles.length}</strong>
          <p>cuidados em dia</p>
        </article>
      </div>

      <div className="progress-grid">
        <section className="rotina-panel">
          <div className="rotina-panel-head">
            <h3>Últimas 8 semanas</h3>
          </div>
          <WeeksChart state={state} today={today} />
          <p className="rotina-footnote">Semana cumprida é aquela com {Math.round(WEEK_GOAL * 100)}% ou mais da rotina feita. Não precisa ser perfeita.</p>
        </section>

        <section className="rotina-panel">
          <div className="rotina-panel-head">
            <h3>Seu Raio-X</h3>
            <button type="button" className="icon-text-btn" onClick={onRedoRaiox}>
              <RotateCcw size={14} /> Refazer
            </button>
          </div>
          <div className="radar-wrap">
            <RadarChart scores={scores} previous={previous} />
          </div>
          <div className="radar-legend">
            <span><i className="now" /> {state.raiox?.date ? `Em ${formatDayShort(state.raiox.date)}` : "Agora"}</span>
            {previous ? <span><i className="before" /> Em {formatDayShort(history[history.length - 2].date)}</span> : null}
          </div>
          <ul className="raiox-scores">
            {DIMENSIONS.map((d) => (
              <li key={d.id} className={(state.raiox?.priorities ?? []).includes(d.id) ? "priority" : ""}>
                <span>{d.label}</span>
                <small>{SCORE_LABELS[scores[d.id] ?? 0] || "Sem nota"}</small>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {children}

      <section className="rotina-panel">
        <div className="rotina-panel-head">
          <h3>Conquistas</h3>
          <small className="muted">{achievements.filter((a) => a.unlocked).length} de {achievements.length}</small>
        </div>
        <ul className="achievement-grid">
          {achievements.map((a) => (
            <li key={a.id} className={a.unlocked ? "achievement on" : "achievement"}>
              <span className="achievement-icon">{a.unlocked ? <Award size={18} /> : <Lock size={15} />}</span>
              <strong>{a.label}</strong>
              <small>{a.description}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="rotina-panel">
        <div className="rotina-panel-head">
          <h3>Histórico de cuidados</h3>
        </div>
        {(state.history ?? []).length === 0 ? (
          <p className="muted">Quando você registrar ou agendar um cuidado, ele aparece aqui.</p>
        ) : (
          <ul className="history-list">
            {state.history.slice(0, 12).map((h) => (
              <li key={h.id}>
                <time>{formatDayShort(h.date)}</time>
                <div>
                  <strong>{cycleById(h.cycleId)?.label ?? h.cycleId}</strong>
                  {h.detail ? <small>{h.detail}</small> : null}
                </div>
                <span className={h.source === "boracuidar" ? "history-source app" : "history-source"}>
                  {h.source === "boracuidar" ? "Agendado no BoraCuidar" : "Registrado por você"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="rotina-danger-zone">
        {confirmReset ? (
          <>
            <p>Isso apaga sua rotina, seus registros e seu Raio-X deste aparelho.</p>
            <div className="dialog-foot">
              <button type="button" className="ghost-btn" onClick={() => setConfirmReset(false)}>Cancelar</button>
              <button type="button" className="danger-btn" onClick={() => resetRotina()}>Apagar tudo</button>
            </div>
          </>
        ) : (
          <button type="button" className="icon-text-btn" onClick={() => setConfirmReset(true)}>Apagar meus dados da rotina</button>
        )}
      </div>
    </div>
  );
}
