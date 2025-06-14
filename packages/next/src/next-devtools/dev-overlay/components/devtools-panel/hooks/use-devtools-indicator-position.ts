import { useState } from 'react'
import { STORAGE_KEY_POSITION } from '../../../shared'

const INDICATOR_POSITION =
  (process.env
    .__NEXT_DEV_INDICATOR_POSITION as typeof window.__NEXT_DEV_INDICATOR_POSITION) ||
  'bottom-left'

export type DevToolsIndicatorPosition = typeof INDICATOR_POSITION

function getInitialPosition() {
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

export function useDevToolsIndicatorPosition(): [
  DevToolsIndicatorPosition,
  (value: DevToolsIndicatorPosition) => void,
] {
  const [position, setPosition] = useState(getInitialPosition())

  const set = (value: DevToolsIndicatorPosition) => {
    setPosition(value)
    localStorage.setItem(STORAGE_KEY_POSITION, value)
  }

  return [position, set]
}
