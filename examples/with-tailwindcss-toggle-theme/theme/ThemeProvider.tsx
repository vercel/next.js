import { useContext, useState, createContext, useEffect } from 'react'

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

  return (
    <ThemeContext.Provider
      value={{
        value: theme,
        toggle: () => setTheme(toggleTheme(theme)),
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

const useLocalStorage = (theme?: string) => {
  if (theme) {
    localStorage.setItem('theme', JSON.stringify(theme))
    return theme
  }
  const jsonValue = localStorage.getItem('theme')
  if (jsonValue) return JSON.parse(jsonValue)
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
