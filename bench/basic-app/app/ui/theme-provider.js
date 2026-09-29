'use client'
import { createContext, useContext, useState } from 'react'

const ThemeContext = createContext('system')

export function useTheme() {
  return useContext(ThemeContext)
}

export default function ThemeProvider({ defaultTheme, children }) {
  const [theme] = useState(defaultTheme ?? 'system')
  return (
    <ThemeContext.Provider value={theme}>
      <div className="theme-root" data-theme={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
