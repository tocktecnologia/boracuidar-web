import { DIMENSIONS } from "../../lib/rotina/catalog";

// Radar das dimensões, escala de 1 a 5. `previous` desenha a medição anterior em tracejado.
export default function RadarChart({ scores = {}, previous = null, size = 300 }) {
  const pad = 58;
  const c = size / 2;
  const r = c - pad;
  const n = DIMENSIONS.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i, value) => {
    const k = Math.max(0, Math.min(5, value)) / 5;
    return [c + Math.cos(angle(i)) * r * k, c + Math.sin(angle(i)) * r * k];
  };
  const polygon = (values) => DIMENSIONS.map((d, i) => point(i, values[d.id] ?? 0).join(",")).join(" ");

  return (
    <svg
      className="rotina-radar"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Raio-X: ${DIMENSIONS.map((d) => `${d.short} ${scores[d.id] ?? 0} de 5`).join(", ")}`}
    >
      {[1, 2, 3, 4, 5].map((level) => (
        <polygon
          key={level}
          className="radar-ring"
          points={DIMENSIONS.map((_, i) => point(i, level).join(",")).join(" ")}
        />
      ))}
      {DIMENSIONS.map((d, i) => {
        const [x, y] = point(i, 5);
        return <line key={d.id} className="radar-axis" x1={c} y1={c} x2={x} y2={y} />;
      })}
      {previous ? <polygon className="radar-previous" points={polygon(previous)} /> : null}
      <polygon className="radar-current" points={polygon(scores)} />
      {DIMENSIONS.map((d, i) => {
        const [x, y] = point(i, scores[d.id] ?? 0);
        return <circle key={d.id} className="radar-dot" cx={x} cy={y} r="3.5" />;
      })}
      {DIMENSIONS.map((d, i) => {
        const [x, y] = point(i, 6.15);
        const cos = Math.cos(angle(i));
        const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
        return (
          <text key={d.id} className="radar-label" x={x} y={y} textAnchor={anchor} dominantBaseline="middle">
            {d.short}
          </text>
        );
      })}
    </svg>
  );
}
