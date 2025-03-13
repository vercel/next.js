import { useState } from 'react'
import {
  STORAGE_KEY_POSITION,
  STORAGE_KEY_SCALE,
  STORAGE_KEY_THEME,
} from '../../../../../shared'

const INDICATOR_POSITION =
  (process.env
    .__NEXT_DEV_INDICATOR_POSITION as typeof window.__NEXT_DEV_INDICATOR_POSITION) ||
  'bottom-left'

export type DevToolsIndicatorPosition = typeof INDICATOR_POSITION

export function getInitialPosition() {
  if (
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(STORAGE_KEY_POSITION)
  ) {
    return localStorage.getItem(
      STORAGE_KEY_POSITION
    ) as DevToolsIndicatorPosition
  }
  return INDICATOR_POSITION
}

//////////////////////////////////////////////////////////////////////////////////////

const BASE_SIZE = 16

export const NEXT_DEV_TOOLS_SCALE = {
  Small: BASE_SIZE / 14,
  Medium: BASE_SIZE / 16,
  Large: BASE_SIZE / 18,
} as const

export type DevToolsScale =
  (typeof NEXT_DEV_TOOLS_SCALE)[keyof typeof NEXT_DEV_TOOLS_SCALE]

function getInitialScale() {
  if (
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(STORAGE_KEY_SCALE)
  ) {
    return Number(localStorage.getItem(STORAGE_KEY_SCALE)) as DevToolsScale
  }
  return NEXT_DEV_TOOLS_SCALE.Medium
}

export function useDevToolsScale(): [
  DevToolsScale,
  (value: DevToolsScale) => void,
] {
  const [scale, setScale] = useState<DevToolsScale>(getInitialScale())

  function set(value: DevToolsScale) {
    setScale(value)
    localStorage.setItem(STORAGE_KEY_SCALE, String(value))
  }

  return [scale, set]
}

//////////////////////////////////////////////////////////////////////////////////////

export function getInitialTheme() {
  if (typeof localStorage === 'undefined') {
    return 'system'
  }
  const theme = localStorage.getItem(STORAGE_KEY_THEME)
  return theme === 'dark' || theme === 'light' ? theme : 'system'
}
