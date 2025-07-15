import { useState } from 'react'
import { STORAGE_KEY_THEME } from '../../../shared'

function getInitialTheme() {
  if (typeof localStorage === 'undefined') {
    return 'system'
  }
  const theme = localStorage.getItem(STORAGE_KEY_THEME)
  return theme === 'dark' || theme === 'light' ? theme : 'system'
}

export function useTheme() {
  return useState(getInitialTheme())
}
