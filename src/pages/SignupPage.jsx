import { useEffect, useMemo, useState } from "react";
import { getAdditionalUserInfo, isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink, signOut, updatePassword } from "firebase/auth";
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import MarketplaceLayout from "../components/layout/MarketplaceLayout";
import { auth } from "../lib/firebase-auth";
import { queryRows } from "../lib/firestore";
import { finalizeOnboarding } from "../lib/onboardingApi";

const emailKey = "boracuidar_signup_email_link";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const defaultPlans = [{ name: "free", label: "Gratuito" }];

function normalizePlan(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "pro" ? "premium" : raw || "free";
}

export default function SignupPage() {
  const incomingEmailLink = useMemo(() => isSignInWithEmailLink(auth, window.location.href), []);
  const savedEmail = useMemo(() => localStorage.getItem(emailKey) ?? "", []);
  const [email, setEmail] = useState(savedEmail);
  const [linkSent, setLinkSent] = useState(false);
  const [openingLink, setOpeningLink] = useState(incomingEmailLink && !savedEmail);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    incomingEmailLink && !savedEmail
      ? "Informe o mesmo email que recebeu o link para concluir a confirmacao."
      : "",
  );
  const [step, setStep] = useState(0);
  const [types, setTypes] = useState([]);
  const [plans, setPlans] = useState(defaultPlans);
  const [form, setForm] = useState({ businessName: "", ownerName: "", whatsapp: "", businessType: "", subscription: "free", password: "" });
  const actionUrl = useMemo(() => `${window.location.origin}/signup`, []);

  useEffect(() => {
    let active = true;
    Promise.all([queryRows({ table: "business_type" }).catch(() => []), queryRows({ table: "subscriptions" }).catch(() => [])]).then(([businessTypes, subscriptionRows]) => {
      if (!active) return;
      setTypes(businessTypes ?? []);
      if (subscriptionRows?.length) setPlans(subscriptionRows.map((row) => ({ name: normalizePlan(row.name), label: String(row.label ?? row.name ?? "Plano") })));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!incomingEmailLink || !savedEmail) return;
    completeEmailLink(savedEmail);
    // The incoming email link must be completed only once on page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField(field, value) { setForm((current) => ({ ...current, [field]: value })); }

  async function sendLink() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) return setError("Informe um email valido.");
    setBusy(true); setError(""); setNotice("");
    try {
      await sendSignInLinkToEmail(auth, normalizedEmail, { url: actionUrl, handleCodeInApp: true });
      localStorage.setItem(emailKey, normalizedEmail);
      setLinkSent(true);
      setNotice("Enviamos um link seguro para confirmar seu email.");
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel enviar o link.");
    } finally { setBusy(false); }
  }

  async function completeEmailLink(candidate = email) {
    const normalizedEmail = candidate.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) return setError("Informe o email que recebeu o link.");
    if (!isSignInWithEmailLink(auth, window.location.href)) return setError("Este link de confirmacao nao e valido.");
    setBusy(true); setError("");
    try {
      const credential = await signInWithEmailLink(auth, normalizedEmail, window.location.href);
      if (!getAdditionalUserInfo(credential)?.isNewUser) {
        await signOut(auth); localStorage.removeItem(emailKey);
        setError("Este email ja possui cadastro. Entre pelo aplicativo com email e senha.");
        return;
      }
      localStorage.removeItem(emailKey);
      setVerified(true); setOpeningLink(false);
      setNotice("Email confirmado. Complete os dados do seu negocio.");
      window.history.replaceState({}, document.title, "/signup");
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel confirmar o email.");
    } finally { setBusy(false); }
  }

  function nextStep() {
    if (step === 0 && !form.businessName.trim()) return setError("Informe o nome do negocio.");
    if (step === 1 && !form.ownerName.trim()) return setError("Informe o nome do responsavel.");
    if (step === 2 && form.whatsapp.replace(/\D/g, "").length < 10) return setError("Informe um numero de WhatsApp valido.");
    if (step === 3 && !form.businessType) return setError("Selecione o tipo de negocio.");
    if (step === 4 && !form.subscription) return setError("Selecione um plano.");
    setError(""); setStep((current) => current + 1);
  }

  async function finish() {
    if (form.password.length < 6) return setError("Crie uma senha com pelo menos 6 caracteres.");
    setBusy(true); setError("");
    try {
      await updatePassword(auth.currentUser, form.password);
      await finalizeOnboarding({
        email: auth.currentUser?.email ?? email.trim().toLowerCase(),
        whatsapp: `55${form.whatsapp.replace(/\D/g, "")}`,
        entityName: form.businessName.trim(), subscription: normalizePlan(form.subscription),
        businessType: form.businessType, ownerName: form.ownerName.trim(),
      });
      setNotice("Cadastro concluido. Use o app Bora Cuidar para acessar sua conta."); setStep(6);
    } catch (requestError) {
      setError(requestError.message || "Nao foi possivel concluir o cadastro.");
    } finally { setBusy(false); }
  }

  const steps = [
    { title: "Nome do negocio", label: "Como seu negocio se chama?", field: "businessName", placeholder: "Ex.: Studio Bela" },
    { title: "Responsavel", label: "Como podemos chamar voce?", field: "ownerName", placeholder: "Seu nome" },
    { title: "WhatsApp", label: "Qual o seu WhatsApp?", field: "whatsapp", placeholder: "(85) 99999-9999", type: "tel" },
  ];

  return <MarketplaceLayout><section className="signup-page" aria-live="polite">
    <div className="signup-intro"><Link className="signup-back" to="/marketplace"><ArrowLeft size={16} /> Voltar ao marketplace</Link><span className="signup-eyebrow">Para negocios</span><h1>Crie a conta do seu negocio.</h1><p>Depois do cadastro, entre pelo app Bora Cuidar para organizar agenda, servicos e clientes.</p></div>
    <div className="signup-panel">
      {!verified ? <><div className="signup-icon"><Mail size={23} /></div><h2>Confirme seu email</h2><p>Enviaremos um link seguro antes de liberar o restante do cadastro.</p><label htmlFor="signup-email">Email</label><input id="signup-email" type="email" value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" /><button className="cta-btn signup-primary" disabled={busy} onClick={() => openingLink ? completeEmailLink() : sendLink()}>{busy ? "Aguarde..." : openingLink ? "Continuar cadastro" : "Enviar link de confirmacao"}</button>{linkSent ? <button className="signup-text-button" disabled={busy} onClick={sendLink}>Reenviar link</button> : null}</> : null}
      {verified && step === 6 ? <div className="signup-complete"><CheckCircle2 size={38} /><h2>Cadastro concluido</h2><p>{notice}</p><a className="cta-btn signup-primary" href="https://boracuidar.app/signin">Ir para o app</a></div> : null}
      {verified && step < 6 ? <><div className="signup-progress">Etapa {step + 1} de 6</div>{step < 3 ? <><h2>{steps[step].title}</h2><label htmlFor={`signup-${steps[step].field}`}>{steps[step].label}</label><input id={`signup-${steps[step].field}`} type={steps[step].type ?? "text"} value={form[steps[step].field]} onChange={(event) => updateField(steps[step].field, event.target.value)} placeholder={steps[step].placeholder} /><button className="cta-btn signup-primary" onClick={nextStep}>Continuar</button></> : null}{step === 3 ? <><h2>Tipo de negocio</h2><label htmlFor="signup-business-type">Qual e o tipo do seu negocio?</label><select id="signup-business-type" value={form.businessType} onChange={(event) => updateField("businessType", event.target.value)}><option value="">Selecione</option>{types.map((type) => <option key={type.type} value={type.type}>{type.label ?? type.type}</option>)}</select><button className="cta-btn signup-primary" onClick={nextStep}>Continuar</button></> : null}{step === 4 ? <><h2>Escolha seu plano</h2><label htmlFor="signup-plan">Plano inicial</label><select id="signup-plan" value={form.subscription} onChange={(event) => updateField("subscription", event.target.value)}>{plans.map((plan) => <option key={plan.name} value={plan.name}>{plan.label}</option>)}</select><button className="cta-btn signup-primary" onClick={nextStep}>Continuar</button></> : null}{step === 5 ? <><h2>Defina sua senha</h2><p className="signup-email-confirmed"><ShieldCheck size={16} /> {auth.currentUser?.email}</p><label htmlFor="signup-password">Senha</label><input id="signup-password" type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} placeholder="Minimo de 6 caracteres" /><button className="cta-btn signup-primary" disabled={busy} onClick={finish}>{busy ? "Concluindo..." : "Concluir cadastro"}</button></> : null}</> : null}
      {error ? <p className="signup-feedback error-text">{error}</p> : null}{notice && !verified ? <p className="signup-feedback">{notice}</p> : null}
    </div>
  </section></MarketplaceLayout>;
}
