import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, out: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const show = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++idCounter;
    setToasts(prev => [...prev, { id, message, type, out: false }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const success = useCallback((msg, dur) => show(msg, 'success', dur), [show]);
  const error   = useCallback((msg, dur) => show(msg, 'error', dur || 6000), [show]);
  const info    = useCallback((msg, dur) => show(msg, 'info', dur), [show]);
  const warning = useCallback((msg, dur) => show(msg, 'warning', dur), [show]);

  return (
    <ToastContext.Provider value={{ show, success, error, info, warning, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, dismiss }) {
  return (
    <div className="toast-wrap" role="region" aria-label="Notifications">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}${t.out ? ' out' : ''}`} role="alert">
          <ToastIcon type={t.type} />
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={14} height={14}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function ToastIcon({ type }) {
  if (type === 'success') return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  if (type === 'error') return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  if (type === 'warning') return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
};
