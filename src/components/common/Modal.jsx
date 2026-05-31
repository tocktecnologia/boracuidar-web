export default function Modal({ isOpen, onClose, children, maxWidth = 760 }) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth }} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
