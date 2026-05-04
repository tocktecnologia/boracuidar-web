import { Star } from "lucide-react";

export default function StarRating({ value = 0, size = 16 }) {
  return (
    <span className="stars" aria-label={`Avaliacao ${value.toFixed(1)} de 5`}>
      {Array.from({ length: 5 }).map((_, index) => {
        const filled = index < Math.round(value);
        return <Star key={index} size={size} className={filled ? "star-filled" : "star-empty"} />;
      })}
    </span>
  );
}
