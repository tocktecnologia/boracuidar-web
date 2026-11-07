import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { CYCLE_CATALOG, INTERVAL_OPTIONS } from "../../lib/rotina/catalog";
import { cycleStatus, dateKey, formatDayShort, formatInterval, sortCyclesByAttention } from "../../lib/rotina/engine";
import { addCycle, markCycleDone, removeCycle, setCycleInterval } from "../../lib/rotina/store";
import { DimensionIcon } from "./RotinaIcon";
import { marketplaceLinkForCycle } from "./links";

function CycleCard({ cycle, today }) {
  const status = cycleStatus(cycle, today);
  const [mode, setMode] = useState(null); // "done" | "edit"
  const [doneDate, setDoneDate] = useState(today);
  const intervals = INTERVAL_OPTIONS.includes(cycle.intervalDays) ? INTERVAL_OPTIONS : [...INTERVAL_OPTIONS, cycle.intervalDays].sort((a, b) => a - b);

  return (
    <li className={`cycle-card ${status.tone}`}>
      <div className="cycle-card-main">
        <span className="habit-icon"><DimensionIcon id={cycle.dim} /></span>
        <div className="cycle-card-text">
          <div className="cycle-card-title">
            <strong>{cycle.label}</strong>
            <span className={`status-chip ${status.tone}`}>{status.tone === "ok" ? "Em dia" : status.label}</span>
          </div>
          <small>
            {cycle.lastDate ? `Última vez em ${formatDayShort(cycle.lastDate)}` : "Você ainda não registrou"} · a cada {formatInterval(cycle.intervalDays)}
            {status.tone === "ok" ? ` · próximo em ${formatDayShort(status.dueDate)}` : ""}
          </small>
          <span className="cycle-bar" aria-hidden="true"><i style={{ width: `${status.ratio * 100}%` }} /></span>
        </div>
      </div>
      <div className="cycle-card-actions">
        <Link className={["ok", "scheduled"].includes(status.tone) ? "ghost-btn small" : "cta-btn small"} to={marketplaceLinkForCycle(cycle)}>Agendar</Link>
        <button type="button" className="ghost-btn small" onClick={() => setMode(mode === "done" ? null : "done")} aria-expanded={mode === "done"}>Já fiz</button>
        <button type="button" className="icon-text-btn" onClick={() => setMode(mode === "edit" ? null : "edit")} aria-expanded={mode === "edit"}>Ajustar</button>
      </div>

      {mode === "done" ? (
        <form
          className="cycle-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            markCycleDone(cycle.id, doneDate || today);
            setMode(null);
          }}
        >
          <label htmlFor={`done-${cycle.id}`}>Quando?</label>
          <input id={`done-${cycle.id}`} type="date" value={doneDate} max={today} onChange={(e) => setDoneDate(e.target.value)} />
          <button type="submit" className="cta-btn small">Registrar</button>
        </form>
      ) : null}

      {mode === "edit" ? (
        <div className="cycle-inline-form">
          <label htmlFor={`interval-${cycle.id}`}>Repetir a cada</label>
          <select id={`interval-${cycle.id}`} value={cycle.intervalDays} onChange={(e) => setCycleInterval(cycle.id, Number(e.target.value))}>
            {intervals.map((days) => <option key={days} value={days}>{formatInterval(days)}</option>)}
          </select>
          <button type="button" className="danger-btn small" onClick={() => removeCycle(cycle.id)}>Remover</button>
        </div>
      ) : null}
    </li>
  );
}

export default function CuidadosTab({ state }) {
  const today = dateKey();
  const cycles = sortCyclesByAttention(state.cycles, today);
  const available = CYCLE_CATALOG.filter((c) => !state.cycles.some((x) => x.id === c.id));
  const late = cycles.filter((c) => cycleStatus(c, today).tone === "late").length;

  return (
    <div className="rotina-cuidados">
      <div className="rotina-section-head">
        <div>
          <p className="cuidados-summary">
            {cycles.length === 0
              ? "Adicione os cuidados que você quer acompanhar."
              : late > 0
                ? `${late} ${late === 1 ? "cuidado passou" : "cuidados passaram"} do prazo.`
                : "Quando você agenda pelo BoraCuidar, o cuidado é registrado sozinho."}
          </p>
        </div>
      </div>

      {cycles.length > 0 ? (
        <ul className="cycle-list">
          {cycles.map((cycle) => <CycleCard key={cycle.id} cycle={cycle} today={today} />)}
        </ul>
      ) : null}

      {available.length > 0 ? (
        <section className="rotina-add-block">
          <p className="rotina-panel-label">Acompanhar também</p>
          <div className="raiox-chip-row">
            {available.map((c) => (
              <button key={c.id} type="button" className="raiox-chip" onClick={() => addCycle(c.id)}>
                <Plus size={13} /> {c.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <p className="rotina-footnote">
        Os intervalos são referências gerais. O seu profissional pode indicar outro ritmo, e você ajusta em Ajustar.
      </p>
    </div>
  );
}
