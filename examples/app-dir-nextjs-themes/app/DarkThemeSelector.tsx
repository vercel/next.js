'use client'
import { useTheme } from 'nextjs-themes'
import { darkThemes } from './themes'
import { useEffect } from 'react'

export default function DarkThemeSelector() {
  const [defaultDarkTheme, setDefaultDarkTheme] = useTheme((state: any) => [
    state.defaultDarkTheme,
    state.setDefaultDarkTheme,
  ])
  useEffect(() => {
    setDefaultDarkTheme(darkThemes[0])
  }, [setDefaultDarkTheme])
  return (
    <p>
      Select default dark theme{' '}
      <select
        value={defaultDarkTheme}
        onChange={(e) => setDefaultDarkTheme(e.target.value)}
      >
        {darkThemes.map((theme) => (
          <option key={theme} value={theme}>
            {theme}
          </option>
        ))}
      </select>
    </p>
  )
}
