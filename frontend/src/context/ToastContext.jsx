import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'info', ttl = 4000) => {
      const id = ++counter;
      setToasts((t) => [...t, { id, message, type }]);
      if (ttl) setTimeout(() => remove(id), ttl);
      return id;
    },
    [remove]
  );

  const toast = {
    success: (m, ttl) => push(m, 'success', ttl),
    error: (m, ttl) => push(m, 'error', ttl),
    warn: (m, ttl) => push(m, 'warn', ttl),
    info: (m, ttl) => push(m, 'info', ttl),
  };

  const icons = {
    success: '✓',
    error: '✕',
    warn: '!',
    info: 'i',
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => remove(t.id)}>
            <div className="ti center" style={{ fontWeight: 800 }}>{icons[t.type]}</div>
            <div style={{ fontSize: '0.9rem' }}>{t.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
