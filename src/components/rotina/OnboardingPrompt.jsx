import { Link } from "react-router-dom";

export default function OnboardingPrompt({ title, text }) {
  return (
    <section className="onboarding-prompt">
      <h2>{title}</h2>
      <p>{text}</p>
      <Link to="/" className="cta-btn">Fazer meu Raio-X</Link>
    </section>
  );
}
