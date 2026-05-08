import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getCreditBalance, getCostMatrix, getEngineCosts, setCreditUpdateCallback } from './api';

const CreditContext = createContext({
  remaining: null,
  monthly: null,
  used: 0,
  dailyUsed: 0,
  dailyLimit: null,
  warning: null,
  costMatrix: {},
  loading: true,
  refresh: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export function useCredits() {
  return useContext(CreditContext);
}

export function CreditProvider({ children }) {
  const [state, setState] = useState({
    remaining: null,
    monthly: null,
    used: 0,
    dailyUsed: 0,
    dailyLimit: null,
    overage: 'soft',
    warning: null,
    costMatrix: {},
    engineCosts: {},
    loading: true,
    isAdmin: false,
  });

  const refresh = useCallback(() => {
    Promise.all([getCreditBalance(), getCostMatrix(), getEngineCosts()]).then(([balance, matrix, engines]) => {
      if (!balance) return;
      setState(prev => ({
        ...prev,
        remaining: balance.credits_remaining,
        monthly: balance.monthly_allocation,
        used: balance.credits_used,
        dailyUsed: balance.daily_used,
        dailyLimit: balance.daily_limit,
        overage: balance.overage_policy,
        isAdmin: balance.is_admin,
        loading: false,
        costMatrix: matrix || prev.costMatrix,
        engineCosts: engines || prev.engineCosts,
      }));
    }).catch(() => {
      setState(prev => ({ ...prev, loading: false }));
    });
  }, []);

  useEffect(() => {
    refresh();
    setCreditUpdateCallback(({ remaining, deducted, warning }) => {
      setState(prev => ({
        ...prev,
        remaining,
        used: prev.monthly != null ? prev.monthly - remaining : prev.used + deducted,
        warning,
      }));
    });
    return () => setCreditUpdateCallback(null);
  }, [refresh]);

  return (
    <CreditContext.Provider value={{ ...state, refresh }}>
      {children}
    </CreditContext.Provider>
  );
}
