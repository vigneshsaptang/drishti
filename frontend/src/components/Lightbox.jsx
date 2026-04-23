import { useState } from 'react';

export function EvidenceImage({ src, alt, className = '' }) {
  const [open, setOpen] = useState(false);

  if (!src) return null;

  return (
    <>
      <img
        src={src}
        alt={alt || 'Evidence'}
        className={`cursor-pointer border border-sap-border rounded object-cover hover:border-sap-accent transition-colors ${className}`}
        onClick={() => setOpen(true)}
        onError={e => e.target.style.display = 'none'}
      />
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setOpen(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={src}
              alt={alt || 'Evidence'}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="absolute top-2 right-2 flex gap-2">
              <a
                href={src}
                target="_blank"
                rel="noopener"
                onClick={e => e.stopPropagation()}
                className="bg-sap-panel/80 text-sap-text px-3 py-1.5 rounded text-xs font-mono hover:bg-sap-panel"
              >
                Open Original
              </a>
              <button
                onClick={() => setOpen(false)}
                className="bg-sap-panel/80 text-sap-text w-8 h-8 rounded flex items-center justify-center hover:bg-sap-panel"
              >
                ×
              </button>
            </div>
            <div className="mt-2 text-center text-xs font-mono text-sap-dim truncate">
              {src}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
