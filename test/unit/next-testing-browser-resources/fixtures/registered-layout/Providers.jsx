'use client'
import React, { createContext } from 'react'
export const Theme = createContext('missing')
export default function Providers({ children }) {
  return <Theme.Provider value="provided">{children}</Theme.Provider>
}
