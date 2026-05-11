export default function Shimmer({ className = 'h-4 w-full' }) {
  return (
    <div className={`relative overflow-hidden bg-sap-panel rounded-sm ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent animate-shimmer" />
    </div>
  );
}
