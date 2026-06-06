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
    <div className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-sap-border-light flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-12 font-semibold tracking-tight text-sap-text">Digital footprint</h3>
          <span className="text-11 text-sap-muted">{services.length} services identified</span>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="inline-flex items-center px-2 h-5 rounded text-11 font-semibold bg-sap-danger-filled text-white tabular-nums">
              {criticalCount} critical
            </span>
          )}
          {highCount > 0 && (
            <span className="inline-flex items-center px-2 h-5 rounded text-11 font-semibold bg-sap-danger-soft text-sap-danger tabular-nums">
              {highCount} high
            </span>
          )}
        </div>
      </div>
      <div className="px-4 py-3 flex flex-wrap gap-2">
        {services.filter(s => s.category !== 'other').map(svc => {
          const catMeta = CATEGORY_META[svc.category] || CATEGORY_META.other;
          const isCritical = svc.severity === 'CRITICAL';
          const isHigh = svc.severity === 'HIGH';
          return (
            <div
              key={svc.collection}
              className={`inline-flex items-center gap-2 pl-2.5 pr-2 py-1 rounded border text-12 ${
                isCritical ? 'border-sap-danger/40 bg-sap-danger-soft' :
                isHigh ? 'border-sap-danger/20 bg-sap-danger-soft/60' :
                'border-sap-border-light bg-sap-panel/60'
              }`}
            >
              <span className={`font-medium ${isCritical ? 'text-sap-danger' : 'text-sap-text'}`}>
                {svc.name}
              </span>
              <span className="text-11 text-sap-muted">
                {catMeta.label}
              </span>
              {isCritical && (
                <span className="inline-flex items-center px-1.5 h-4 rounded text-11 font-semibold bg-sap-danger-filled text-white leading-none">
                  Critical
                </span>
              )}
              {isHigh && (
                <span className="inline-flex items-center px-1.5 h-4 rounded text-11 font-semibold bg-sap-danger-soft text-sap-danger border border-sap-danger/30 leading-none">
                  High
                </span>
              )}
            </div>
          );
        })}
        {(() => {
          const otherCount = services.filter(s => s.category === 'other').length;
          if (!otherCount) return null;
          return (
            <div className="inline-flex items-center gap-2 pl-2.5 pr-2 py-1 rounded border border-sap-border-light bg-sap-panel/60 text-12">
              <span className="text-sap-dim">+{otherCount} other {otherCount === 1 ? 'source' : 'sources'}</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
