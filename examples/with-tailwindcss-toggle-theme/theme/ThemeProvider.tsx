import { createContext, useContext, useEffect, useMemo, useState } from 'react'

interface Theme {
  value: string
  toggle: Function
}
const ThemeContext = createContext({} as Theme)

export const useTheme = () => useContext(ThemeContext)

export const ThemeProvider = ({ children }: any) => {
  const [theme, setTheme] = useState('')

  useEffect(() => {
    setTheme(getTheme())
  }, [])

  const value = useMemo(
    () => ({
      value: theme,
      toggle: () => setTheme(toggleTheme(theme)),
    }),
    [theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

const useLocalStorage = (theme?: string) => {
  if (theme) {
    localStorage.setItem('theme', theme)
    return theme
  }
  const themeValue = localStorage.getItem('theme')
  if (themeValue) return themeValue
  return ''
}

const getTheme = () => {
  const theme = useLocalStorage()
  if (
    theme === 'dark' ||
    (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    document.documentElement.classList.add('dark')
    return 'dark'
  }
  return 'light'
}

const toggleTheme = (theme: string) => {
  if (theme === 'dark') {
    document.documentElement.classList.remove('dark')
    return useLocalStorage('light')
  }
  document.documentElement.classList.add('dark')
  return useLocalStorage('dark')
}
