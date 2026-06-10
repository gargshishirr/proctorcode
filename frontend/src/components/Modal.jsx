import Icon from './Icon';

export default function Modal({ title, subtitle, onClose, children, footer, width }) {
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={width ? { maxWidth: width } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head spread">
          <div>
            <h3 style={{ fontSize: '1.15rem' }}>{title}</h3>
            {subtitle && <div className="muted" style={{ fontSize: '0.85rem', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
