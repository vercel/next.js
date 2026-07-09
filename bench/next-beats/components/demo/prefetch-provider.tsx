'use client';

import { createContext, use, useContext } from 'react';

const PrefetchContext = createContext<Promise<boolean> | null>(null);

export function PrefetchProvider({ value, children }: { value: Promise<boolean>; children: React.ReactNode }) {
  return <PrefetchContext.Provider value={value}>{children}</PrefetchContext.Provider>;
}

export function usePrefetchDefault() {
  const promise = useContext(PrefetchContext);
  if (!promise) return true;
  return use(promise);
}
