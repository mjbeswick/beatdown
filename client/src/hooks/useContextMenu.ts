import { useState, useCallback } from 'react';

export interface MenuPosition { x: number; y: number; }

export function useContextMenu() {
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const open = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPos({ x: e.clientX, y: e.clientY });
  }, []);
  const close = useCallback(() => setPos(null), []);
  return { pos, open, close };
}
