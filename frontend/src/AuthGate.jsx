import { useState, useEffect, useCallback } from 'react';
import LoginPage from './components/LoginPage';
import { fetchAuthStatus, postLogin } from './lib/auth';

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  const runBootstrap = useCallback(async () => {
    const status = await fetchAuthStatus();
    if (!status.auth_required) {
      await postLogin('', '');
      setOk(true);
    } else if (sessionStorage.getItem('saptang_token')) {
      setOk(true);
    } else {
      setOk(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await runBootstrap();
      } catch {
        setOk(false);
      } finally {
        setReady(true);
      }
    })();
  }, [runBootstrap]);

  useEffect(() => {
    const h = () => { setOk(false); };
    window.addEventListener('saptang-auth-failed', h);
    return () => window.removeEventListener('saptang-auth-failed', h);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sap-bg text-sap-dim text-sm">
        Loading Auracle…
      </div>
    );
  }

  if (!ok) {
    return <LoginPage onSuccess={() => setOk(true)} />;
  }

  return children;
}
