'use client'
import { useTheme, ColorSchemeType } from 'nextjs-themes'

const colorSchemes: ColorSchemeType[] = ['', 'system', 'light', 'dark']

export default function ColorSchemePreference() {
  const [colorSchemePref, setColorSchemePref] = useTheme((state: any) => [
    state.colorSchemePref,
    state.setColorSchemePref,
  ])
  return (
    <p>
      Color Scheme Preference{' '}
      <select
        value={colorSchemePref}
        onChange={(e) => setColorSchemePref(e.target.value as ColorSchemeType)}
      >
        {colorSchemes.map((theme) => (
          <option key={theme} value={theme}>
            {theme}
          </option>
        ))}
      </select>
    </p>
  )
}
