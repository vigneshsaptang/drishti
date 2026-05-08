import { useCredits } from '../lib/creditContext';

export default function CreditBar({ onClick }) {
  const { remaining, monthly, loading, isAdmin } = useCredits();

  if (loading || remaining === null || isAdmin) return null;

  const pct = monthly > 0 ? Math.max(0, Math.min(100, (remaining / monthly) * 100)) : 100;
  const color = pct > 50 ? 'bg-emerald-500' : pct > 10 ? 'bg-amber-500' : 'bg-rose-500';
  const textColor = pct > 50 ? 'text-emerald-600' : pct > 10 ? 'text-amber-600' : 'text-rose-600';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded border border-sap-border hover:border-sap-accent/30 transition-colors cursor-pointer"
      title={`${remaining.toLocaleString()} / ${monthly.toLocaleString()} credits remaining`}
    >
      <div className="w-8 h-2.5 rounded-full bg-sap-bg border border-sap-border overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-mono font-semibold tabular-nums ${textColor}`}>
        {remaining.toLocaleString()}
      </span>
    </button>
  );
}
