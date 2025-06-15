"use client";

import { createContext, useState } from "react";

export const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState({});

  return (
    <StoreContext.Provider value={{ state, setState }}>
      {children}
    </StoreContext.Provider>
  );
}
