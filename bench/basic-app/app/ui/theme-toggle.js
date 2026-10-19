'use client'
import { describeUtils } from './vendor-util'
import { useState } from 'react'
export default function ThemeToggle() {
  const [theme, setTheme] = useState('system')
  const next =
    theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system'
  return (
    <button
      type="button"
      className="theme-toggle"
      title={'Theme: ' + theme}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark'
        ? '\u263E'
        : theme === 'light'
          ? '\u2600\uFE0E'
          : '\u25D1'}
    </button>
  )
}

export const __layers = [describeUtils].length
