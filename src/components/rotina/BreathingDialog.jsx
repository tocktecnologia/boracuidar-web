import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Modal from "../common/Modal";
import { dateKey } from "../../lib/rotina/engine";
import { getRotina, setHabitValue } from "../../lib/rotina/store";

const INHALE = 4;
const EXHALE = 6;
const CYCLE = INHALE + EXHALE;
const DURATIONS = [1, 3, 5];

// Respiração guiada: puxa o ar em 4 segundos, solta em 6.
export default function BreathingDialog({ isOpen, onClose }) {
  const [minutes, setMinutes] = useState(3);
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef(null);

  useEffect(() => () => window.clearInterval(timer.current), []);

  function start() {
    window.clearInterval(timer.current);
    setElapsed(0);
    setPhase("running");
    const total = minutes * 60;
    let seconds = 0;
    timer.current = window.setInterval(() => {
      seconds += 1;
      setElapsed(seconds);
      if (seconds >= total) {
        window.clearInterval(timer.current);
        setPhase("done");
        const state = getRotina();
        if (state.habits?.some((h) => h.id === "respiracao")) setHabitValue("respiracao", dateKey(), 1);
      }
    }, 1000);
  }

  function close() {
    window.clearInterval(timer.current);
    setPhase("idle");
    setElapsed(0);
    onClose?.();
  }

  const inCycle = elapsed % CYCLE;
  const inhaling = phase === "running" && inCycle < INHALE;
  const left = Math.max(0, minutes * 60 - elapsed);
  const mm = String(Math.floor(left / 60));
  const ss = String(left % 60).padStart(2, "0");

  return (
    <Modal isOpen={isOpen} onClose={close} maxWidth={460}>
      <div className="breathing">
        <div className="dialog-head">
          <div>
            <h3>Respirar com calma</h3>
            <p>Puxe o ar enquanto o círculo cresce e solte devagar enquanto ele diminui.</p>
          </div>
          <button type="button" className="business-schedules-close" onClick={close} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="breathing-stage" aria-live="polite">
          <div className={["breathing-circle", phase === "running" ? (inhaling ? "in" : "out") : ""].join(" ")} />
          <p className="breathing-cue">
            {phase === "idle" ? "Pronto quando você estiver" : phase === "done" ? "Muito bem" : inhaling ? "Puxe o ar" : "Solte devagar"}
          </p>
          {phase === "running" ? <p className="breathing-time">{mm}:{ss}</p> : null}
        </div>

        {phase === "idle" ? (
          <>
            <div className="breathing-durations" role="radiogroup" aria-label="Duração">
              {DURATIONS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={minutes === m} className={minutes === m ? "raiox-chip active" : "raiox-chip"} onClick={() => setMinutes(m)}>
                  {m} min
                </button>
              ))}
            </div>
            <button type="button" className="cta-btn breathing-start" onClick={start}>Começar</button>
          </>
        ) : null}
        {phase === "running" ? <button type="button" className="ghost-btn breathing-start" onClick={close}>Parar</button> : null}
        {phase === "done" ? (
          <>
            <p className="breathing-done">Você fez {minutes} {minutes === 1 ? "minuto" : "minutos"} de respiração. Isso já conta na sua rotina de hoje.</p>
            <button type="button" className="cta-btn breathing-start" onClick={close}>Concluir</button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
