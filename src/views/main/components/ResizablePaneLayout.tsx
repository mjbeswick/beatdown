import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';

type PaneSide = 'left' | 'right';

interface Props {
  storageKey: string;
  defaultWidth: number;
  minPaneWidth?: number;
  maxPaneWidth?: number;
  minContentWidth?: number;
  side?: PaneSide;
  pane: ReactNode;
  children: ReactNode;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getWidthBounds(
  containerWidth: number,
  minPaneWidth: number,
  maxPaneWidth: number,
  minContentWidth: number
) {
  const minWidth = Math.max(0, Math.min(minPaneWidth, maxPaneWidth));
  const configuredMaxWidth = Math.max(minWidth, maxPaneWidth);
  const maxWidth =
    containerWidth > 0
      ? Math.max(minWidth, Math.min(configuredMaxWidth, containerWidth - minContentWidth))
      : configuredMaxWidth;

  return { minWidth, maxWidth };
}

export default function ResizablePaneLayout({
  storageKey,
  defaultWidth,
  minPaneWidth = 180,
  maxPaneWidth = 480,
  minContentWidth = 320,
  side = 'left',
  pane,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number; handle: HTMLDivElement } | null>(null);
  const cursorRef = useRef('');
  const userSelectRef = useRef('');
  const [paneWidth, setPaneWidth] = usePersistedState<number>(storageKey, defaultWidth);
  const [isDragging, setIsDragging] = useState(false);

  const readWidthBounds = () =>
    getWidthBounds(
      containerRef.current?.clientWidth ?? 0,
      minPaneWidth,
      maxPaneWidth,
      minContentWidth
    );

  const clampWidth = (nextWidth: number) => {
    const { minWidth, maxWidth } = readWidthBounds();

    return clamp(Math.round(nextWidth), minWidth, maxWidth);
  };

  const { minWidth: resolvedMinWidth, maxWidth: resolvedMaxWidth } = readWidthBounds();
  const resolvedPaneWidth = clamp(Math.round(paneWidth), resolvedMinWidth, resolvedMaxWidth);

  useEffect(() => {
    const syncWidth = () => {
      const nextWidth = clampWidth(paneWidth);
      if (nextWidth !== paneWidth) setPaneWidth(nextWidth);
    };

    syncWidth();
    window.addEventListener('resize', syncWidth);
    return () => window.removeEventListener('resize', syncWidth);
  }, [maxPaneWidth, minContentWidth, minPaneWidth, paneWidth, setPaneWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      const delta = (event.clientX - drag.startX) * (side === 'left' ? 1 : -1);
      setPaneWidth(clampWidth(drag.startWidth + delta));
    };

    const stopDragging = (event?: PointerEvent) => {
      const drag = dragRef.current;
      if (event && drag && event.pointerId !== drag.pointerId) return;

      if (drag?.handle.hasPointerCapture(drag.pointerId)) {
        drag.handle.releasePointerCapture(drag.pointerId);
      }

      dragRef.current = null;
      setIsDragging(false);
      document.body.style.cursor = cursorRef.current;
      document.body.style.userSelect = userSelectRef.current;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      stopDragging();
    };
  }, [isDragging, maxPaneWidth, minContentWidth, minPaneWidth, setPaneWidth, side]);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: resolvedPaneWidth,
      handle: event.currentTarget,
    };

    cursorRef.current = document.body.style.cursor;
    userSelectRef.current = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    setIsDragging(true);
  };

  const resetWidth = () => setPaneWidth(clampWidth(defaultWidth));

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      setPaneWidth(resolvedMinWidth);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setPaneWidth(resolvedMaxWidth);
      return;
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const separatorDelta = event.key === 'ArrowLeft' ? -step : step;
    const widthDelta = separatorDelta * (side === 'left' ? 1 : -1);
    setPaneWidth(clampWidth(paneWidth + widthDelta));
  };

  const borderClass = side === 'left' ? 'border-r border-zinc-800' : 'border-l border-zinc-800';
  const handleOffsetClass = side === 'left' ? '-right-1.5' : '-left-1.5';
  const dividerEdgeClass = side === 'left' ? 'right-0' : 'left-0';

  const paneNode = (
    <div
      className={`relative shrink-0 min-h-0 ${borderClass}`}
      style={{
        width: resolvedPaneWidth,
        minWidth: resolvedMinWidth,
        maxWidth: resolvedMaxWidth,
      }}
    >
      <div className="h-full min-h-0 overflow-hidden">{pane}</div>

      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize panel"
        aria-orientation="vertical"
        aria-valuemin={resolvedMinWidth}
        aria-valuemax={resolvedMaxWidth}
        aria-valuenow={resolvedPaneWidth}
        title="Drag to resize. Double-click to reset."
        onPointerDown={beginResize}
        onDoubleClick={resetWidth}
        onKeyDown={handleKeyDown}
        className={`group absolute inset-y-0 ${handleOffsetClass} z-20 flex w-3 cursor-col-resize touch-none items-center justify-center outline-none`}
      >
        <span
          className={`h-full w-px transition-colors ${
            isDragging ? 'bg-emerald-400/80' : 'bg-zinc-700/0 group-hover:bg-zinc-500/80 group-focus-visible:bg-zinc-500/80'
          }`}
        />
      </div>

      <div
        className={`pointer-events-none absolute inset-y-0 ${dividerEdgeClass} w-px transition-colors ${
          isDragging ? 'bg-emerald-400/70' : 'bg-zinc-700/60'
        }`}
      />
    </div>
  );

  const contentNode = <div className="flex-1 min-w-0 min-h-0 overflow-hidden">{children}</div>;

  return (
    <div ref={containerRef} className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
      {side === 'left' ? paneNode : contentNode}
      {side === 'left' ? contentNode : paneNode}
    </div>
  );
}