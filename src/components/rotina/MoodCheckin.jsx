import { useState } from "react";
import { Annoyed, Frown, Laugh, Meh, Smile } from "lucide-react";
import { MOODS } from "../../lib/rotina/content";
import { setMood } from "../../lib/rotina/store";

const ICONS = { 1: Frown, 2: Annoyed, 3: Meh, 4: Smile, 5: Laugh };

export default function MoodCheckin({ state, dayKey, compact = false }) {
  const current = state.moods?.[dayKey];
  const [note, setNote] = useState(current?.note ?? "");
  const [editingNote, setEditingNote] = useState(false);

  return (
    <section className={compact ? "mood-checkin compact" : "mood-checkin"} aria-label="Como você está">
      <div className="mood-checkin-head">
        <h3>{current ? "Você está se sentindo" : "Como você está hoje?"}</h3>
        {current ? <span className="mood-current-label">{MOODS.find((m) => m.score === current.score)?.label}</span> : null}
      </div>
      <div className="mood-scale" role="radiogroup" aria-label="Seu humor hoje">
        {MOODS.map((mood) => {
          const Icon = ICONS[mood.score];
          const active = current?.score === mood.score;
          return (
            <button
              key={mood.score}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={mood.label}
              className={active ? `mood-btn active m${mood.score}` : `mood-btn m${mood.score}`}
              onClick={() => setMood(dayKey, active ? 0 : mood.score)}
            >
              <Icon size={24} aria-hidden="true" />
              <span>{mood.label}</span>
            </button>
          );
        })}
      </div>
      {current ? (
        editingNote ? (
          <form
            className="mood-note-form"
            onSubmit={(event) => {
              event.preventDefault();
              setMood(dayKey, current.score, note.trim());
              setEditingNote(false);
            }}
          >
            <label htmlFor={`mood-note-${dayKey}`} className="sr-only">O que marcou seu dia</label>
            <input
              id={`mood-note-${dayKey}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="O que marcou seu dia? Fica só com você."
              maxLength={140}
              autoFocus
            />
            <button type="submit" className="ghost-btn small">Salvar</button>
          </form>
        ) : (
          <button type="button" className="icon-text-btn mood-note-toggle" onClick={() => setEditingNote(true)}>
            {current.note ? `“${current.note}”` : "Escrever uma linha sobre o dia"}
          </button>
        )
      ) : null}
    </section>
  );
}
