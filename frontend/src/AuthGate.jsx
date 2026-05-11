import { useState, useEffect, useCallback } from 'react';
import LoginPage from './components/LoginPage';
import SetupWizard from './components/SetupWizard';
import ForcePasswordChange from './components/ForcePasswordChange';
import { fetchAuthStatus, getUser } from './lib/auth';
import { CreditProvider } from './lib/creditContext';

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [_pendingCredentials, setPendingCredentials] = useState(null);

  const runBootstrap = useCallback(async () => {
    const status = await fetchAuthStatus();
    if (!status.setup_complete) {
      setSetupNeeded(true);
      return;
    }
    setSetupNeeded(false);
    const user = getUser();
    if (sessionStorage.getItem('saptang_token') && user) {
      if (user.force_password_change) {
        setForcePasswordChange(true);
      } else {
        setOk(true);
      }
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
    const h = () => {
      setOk(false);
      setForcePasswordChange(false);
    };
    window.addEventListener('saptang-auth-failed', h);
    return () => window.removeEventListener('saptang-auth-failed', h);
  }, []);

  const handleLoginSuccess = useCallback((data) => {
    if (data?.user?.force_password_change) {
      setPendingCredentials({ username: data.user.username });
      setForcePasswordChange(true);
    } else {
      setOk(true);
    }
  }, []);

  const handleSetupComplete = useCallback(() => {
    setSetupNeeded(false);
    setOk(true);
  }, []);

  const handlePasswordChanged = useCallback(() => {
    setForcePasswordChange(false);
    setPendingCredentials(null);
    setOk(true);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sap-bg text-sap-dim text-sm">
        Loading Auracle…
      </div>
    );
  }

  if (setupNeeded) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  if (forcePasswordChange) {
    return <ForcePasswordChange onComplete={handlePasswordChanged} />;
  }

  if (!ok) {
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  return <CreditProvider>{children}</CreditProvider>;
}
