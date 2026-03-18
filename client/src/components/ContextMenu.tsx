import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuEntry =
  | { label: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }
  | { separator: true };

interface Props {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [adjustedX, setAdjustedX] = useState(x);
  const [adjustedY, setAdjustedY] = useState(y);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth) nx = window.innerWidth - rect.width - 8;
    if (ny + rect.height > window.innerHeight) ny = window.innerHeight - rect.height - 8;
    setAdjustedX(nx);
    setAdjustedY(ny);
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouse);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouse);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: adjustedY, left: adjustedX, zIndex: 9999 }}
      className="bg-zinc-800 border border-zinc-700 rounded shadow-2xl py-1 min-w-44 text-sm"
    >
      {items.map((item, i) => {
        if ('separator' in item) {
          return <div key={i} className="my-1 border-t border-zinc-700" />;
        }
        return (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
              item.disabled
                ? 'opacity-40 cursor-not-allowed'
                : item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {item.icon && (
              <span className="flex-shrink-0 w-4 text-zinc-500">{item.icon}</span>
            )}
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
