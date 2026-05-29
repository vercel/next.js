'use client'

import React, { useContext } from 'react'

export type ServerInsertedHTMLHook = (callbacks: () => React.ReactNode) => void

// Use `React.createContext` to avoid errors from the RSC checks because
// it can't be imported directly in Server Components:
//
//   import { createContext } from 'react'
//
// More info: https://github.com/vercel/next.js/pull/40686
export const ServerInsertedHTMLContext =
  React.createContext<ServerInsertedHTMLHook | null>(null as any)

export function useServerInsertedHTML(callback: () => React.ReactNode): void {
  const addInsertedServerHTMLCallback = useContext(ServerInsertedHTMLContext)
  // Should have no effects on client where there's no flush effects provider
  if (addInsertedServerHTMLCallback) {
    addInsertedServerHTMLCallback(callback)
  }
}
