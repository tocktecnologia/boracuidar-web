import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "../common/Modal";

function generateCode() {
  return Array.from({ length: 6 }).map(() => Math.floor(Math.random() * 10)).join("");
}

export default function PhoneVerificationDialog({ isOpen, phoneDigits, onCancel, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, phoneDigits]);

  async function sendCode() {
    setLoading(true);
    setError("");
    setInputCode("");
    setCodeSent(false);
    const generated = generateCode();
    setCode(generated);

    try {
      const response = await fetch("https://n8n.tock.app.br/webhook/gatilho-whatsapp-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: phoneDigits, code: generated }),
      });

      if (response.ok) {
        setCodeSent(true);
      } else {
        setError(`Falha ao enviar codigo (status ${response.status}).`);
      }
    } catch {
      setError("Falha ao enviar codigo de verificacao para o WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  function verifyCode() {
    if (inputCode.trim().length < 6) {
      setError("Digite o codigo de 6 digitos recebido.");
      return;
    }

    if (inputCode.trim() !== code) {
      setError("Codigo incorreto. Confira e tente novamente.");
      return;
    }

    onSuccess?.();
  }

  return (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth={520}>
      <div className="verify-dialog">
        <h3>Confirmar WhatsApp</h3>
        <p>Enviamos um codigo para +{phoneDigits}. Digite abaixo para continuar.</p>

        {loading ? <p><Loader2 size={16} className="spin" /> Enviando codigo...</p> : null}

        <input
          value={inputCode}
          onChange={(event) => setInputCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className="verify-input"
        />

        {error ? <p className="error-text">{error}</p> : null}

        <div className="verify-actions">
          <button className="ghost-btn" onClick={onCancel}>Cancelar</button>
          <button className="ghost-btn" onClick={sendCode} disabled={loading || !codeSent}>Reenviar</button>
          <button className="cta-btn" onClick={verifyCode} disabled={loading || !codeSent}>Confirmar</button>
        </div>
      </div>
    </Modal>
  );
}
