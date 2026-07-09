'use client';

import { createContext, useContext, useState } from 'react';

export type BoundaryMode = 'off' | 'on';

type BoundaryContextType = {
  mode: BoundaryMode;
  toggleMode: () => void;
};

const BoundaryContext = createContext<BoundaryContextType | null>(null);

export function BoundaryProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<BoundaryMode>('off');
  const toggleMode = () => setMode(prev => (prev === 'off' ? 'on' : 'off'));

  return <BoundaryContext.Provider value={{ mode, toggleMode }}>{children}</BoundaryContext.Provider>;
}

export function useBoundaryMode() {
  const ctx = useContext(BoundaryContext);
  if (!ctx) throw new Error('useBoundaryMode must be used within BoundaryProvider');
  return ctx;
}
