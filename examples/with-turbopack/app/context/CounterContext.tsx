'use client';

import React from 'react';

const CounterContext = React.createContext<
  [number, React.Dispatch<React.SetStateAction<number>>] | undefined
>(undefined);

export function CounterProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = React.useState(0);
  return (
    <CounterContext.Provider value={[count, setCount]}>
      {children}
    </CounterContext.Provider>
  );
}

export function useCounter() {
  const context = React.useContext(CounterContext);
  if (context === undefined) {
    throw new Error('useCounter must be used within a CounterProvider');
  }
  return context;
}
