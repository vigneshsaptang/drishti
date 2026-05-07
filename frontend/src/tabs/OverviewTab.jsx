import { extractDigitalFootprint, CATEGORY_META, SEVERITY_META } from '../lib/serviceMap';

export default function OverviewTab({ data, results }) {
  if (!data) return null;

  const services = extractDigitalFootprint(results);
  const criticalCount = services.filter(s => s.severity === 'CRITICAL').length;
  const highCount = services.filter(s => s.severity === 'HIGH').length;

  return (
    <div className="animate-fade-in space-y-4">
      {services.length > 0 && (
        <DigitalFootprint services={services} criticalCount={criticalCount} highCount={highCount} />
      )}
    </div>
  );
}

function DigitalFootprint({ services, criticalCount, highCount }) {
  return (
    <div className="rounded-lg border border-sap-border bg-sap-surface shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-sap-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-mono tracking-widest text-sap-dim uppercase font-semibold">Digital Footprint</h3>
          <span className="text-xs font-mono text-sap-muted">{services.length} services identified</span>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-entity-drug text-white">
              {criticalCount} CRITICAL
            </span>
          )}
          {highCount > 0 && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-entity-drug/15 text-entity-drug border border-entity-drug/40">
              {highCount} HIGH
            </span>
          )}
        </div>
      </div>
      <div className="px-5 py-4 flex flex-wrap gap-2">
        {services.filter(s => s.category !== 'other').map(svc => {
          const catMeta = CATEGORY_META[svc.category] || CATEGORY_META.other;
          const isCritical = svc.severity === 'CRITICAL';
          const isHigh = svc.severity === 'HIGH';
          return (
            <div
              key={svc.collection}
              className={`inline-flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded border text-xs font-mono ${
                isCritical ? 'border-entity-drug/40 bg-entity-drug/5' :
                isHigh ? 'border-entity-drug/20 bg-entity-drug/[0.03]' :
                'border-sap-border bg-sap-panel/50'
              }`}
            >
              <span className={`font-medium ${isCritical ? 'text-entity-drug' : 'text-sap-text'}`}>
                {svc.name}
              </span>
              <span className={`text-[10px] uppercase tracking-wider ${catMeta.color} opacity-70`}>
                {catMeta.label}
              </span>
              {isCritical && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-entity-drug text-white leading-none">
                  CRITICAL
                </span>
              )}
              {isHigh && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-entity-drug/15 text-entity-drug border border-entity-drug/30 leading-none">
                  HIGH
                </span>
              )}
            </div>
          );
        })}
        {(() => {
          const otherCount = services.filter(s => s.category === 'other').length;
          if (!otherCount) return null;
          return (
            <div className="inline-flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded border border-sap-border bg-sap-panel/50 text-xs font-mono">
              <span className="text-sap-dim">+{otherCount} other {otherCount === 1 ? 'source' : 'sources'}</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

