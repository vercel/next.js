import { useState } from 'react'

import { STORAGE_KEY_SCALE } from '../../../shared'

const BASE_SIZE = 16

export const NEXT_DEV_TOOLS_SCALE = {
  Small: BASE_SIZE / 14,
  Medium: BASE_SIZE / 16,
  Large: BASE_SIZE / 18,
}

function getInitialScale(): number {
  if (
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(STORAGE_KEY_SCALE)
  ) {
    return Number(localStorage.getItem(STORAGE_KEY_SCALE))
  }
  return NEXT_DEV_TOOLS_SCALE.Medium
}

export function useDevToolsScale(): [number, (value: number) => void] {
  const [scale, setScale] = useState<number>(getInitialScale())

  const set = (value: number) => {
    setScale(value)
    localStorage.setItem(STORAGE_KEY_SCALE, String(value))
  }

  return [scale, set]
}
