export default function SectionDivider({ label, sub, accent = 'text-sap-dim' }) {
  return (
    <div className="flex items-center gap-3 pt-6 pb-3 select-none">
      <span aria-hidden className="text-sap-border text-[10px] font-mono">§</span>
      <span className={`text-[10px] font-mono font-semibold tracking-[0.28em] uppercase ${accent}`}>
        {label}
      </span>
      {sub && <span className="text-[9px] font-mono text-sap-muted">{sub}</span>}
      <span aria-hidden className="flex-1 h-px bg-gradient-to-r from-sap-border via-sap-border/50 to-transparent" />
    </div>
  );
}
