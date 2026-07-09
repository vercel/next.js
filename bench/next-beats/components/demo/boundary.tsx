'use client';

import { useEffect, useRef, useState } from 'react';
import { useBoundaryMode } from './boundary-provider';

type Props = {
  children: React.ReactNode;
  label?: string;
};

export function Boundary({ children, label }: Props) {
  const { mode } = useBoundaryMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    if (mode === 'off') return;
    const checkSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setIsSmall(width < 36 && height < 36);
      }
    };

    checkSize();
    const observer = new ResizeObserver(checkSize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [mode]);

  if (mode === 'off') {
    return <>{children}</>;
  }

  if (isSmall) {
    return (
      <div className="group/boundary relative" style={{ viewTransitionName: 'none' }}>
        <div ref={containerRef}>{children}</div>
        <div className="absolute -top-1 -right-1 flex items-center">
          <span className="pointer-events-none absolute right-full mr-1 hidden rounded bg-[#4f6ef7] px-1.5 py-0.5 font-mono text-[10px] leading-none font-semibold whitespace-nowrap text-white shadow group-hover/boundary:block">
            {label || 'Client'}
          </span>
          <div className="h-2.5 w-2.5 rounded-full bg-[#4f6ef7]" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-md border-2 border-[#4f6ef7]"
      style={{ viewTransitionName: 'none' }}
    >
      {label && (
        <span className="absolute -top-px left-2 -translate-y-full rounded-t bg-[#4f6ef7] px-1.5 py-0.5 font-mono text-[10px] leading-none font-semibold text-white">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
