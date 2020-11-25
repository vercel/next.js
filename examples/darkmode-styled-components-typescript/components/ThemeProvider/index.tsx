import { createContext, ReactNode, useEffect, useState } from 'react'

import { Theme } from '../../styles/Theme'

interface ThemeContext {
  colorMode: string
  setColorMode: (newValue: string) => void
}

export const ThemeContext = createContext<ThemeContext>({} as ThemeContext)

interface Props {
  children: ReactNode
}

export function ThemeProvider({ children }: Props): JSX.Element {
  const [colorMode, rawSetColorMode] = useState('')

  useEffect(() => {
    const root = window.document.documentElement
    const initialColorValue = root.style.getPropertyValue(
      '--initial-color-mode'
    )
    rawSetColorMode(initialColorValue)
  }, [])

  function setColorMode(newValue: string): void {
    const root = window.document.documentElement
    // 1. Update React color-mode state
    rawSetColorMode(newValue)
    // 2. Update localStorage
    localStorage.setItem('color-mode', newValue)

    // 3. Update each color
    Object.entries(Theme[newValue]).forEach(([name, colorByTheme]) => {
      const cssVarName = `--color-${name}`

      root.style.setProperty(cssVarName, String(colorByTheme))
    })
  }

  return (
    <ThemeContext.Provider value={{ colorMode, setColorMode }}>
      {children}
    </ThemeContext.Provider>
  )
}
