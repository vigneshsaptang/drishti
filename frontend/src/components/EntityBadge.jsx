import { entityColors } from '../lib/utils';

export default function EntityBadge({ type, value, onClick }) {
  const c = entityColors[type] || entityColors.phone;
  return (
    <button
      onClick={() => onClick?.(type, value)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold cursor-pointer hover:opacity-80 transition-opacity border ${c.bg} ${c.text} ${c.border}`}
    >
      {type.toUpperCase()}: {value}
    </button>
  );
}
