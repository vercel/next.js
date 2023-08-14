'use client'
import { useTheme } from 'nextjs-themes'
import { lightThemes } from './themes'
import { useEffect } from 'react'

export default function LightThemeSelector() {
  const [defaultLightTheme, setDefaultLightTheme] = useTheme((state: any) => [
    state.defaultLightTheme,
    state.setDefaultLightTheme,
  ])
  useEffect(() => {
    setDefaultLightTheme(lightThemes[0])
  }, [setDefaultLightTheme])
  return (
    <p>
      Select default light theme{' '}
      <select
        value={defaultLightTheme}
        onChange={(e) => setDefaultLightTheme(e.target.value)}
      >
        {lightThemes.map((theme) => (
          <option key={theme} value={theme}>
            {theme}
          </option>
        ))}
      </select>
    </p>
  )
}
