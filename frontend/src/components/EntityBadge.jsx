import { entityColors } from '../lib/utils';

export default function EntityBadge({ type, value, onClick }) {
  const c = entityColors[type] || entityColors.phone;
  return (
    <button
      onClick={() => onClick?.(type, value)}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-12 font-medium cursor-pointer hover:opacity-80 transition-colors duration-150 border ${c.bg} ${c.text} ${c.border}`}
    >
      <span className="uppercase tracking-wide text-11 opacity-80">{type}</span>
      <span className="font-mono">{value}</span>
    </button>
  );
}
