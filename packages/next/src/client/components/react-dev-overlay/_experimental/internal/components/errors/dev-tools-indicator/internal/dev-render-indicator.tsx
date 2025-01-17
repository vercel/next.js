/*
 * Singleton store to track whether the app is currently being rendered
 * Used by the dev tools indicator to show render status
 */

import { useSyncExternalStore } from 'react'

let isVisible = false
let listeners: Array<() => void> = []

const subscribe = (listener: () => void) => {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

const getSnapshot = () => isVisible

const show = () => {
  isVisible = true
  listeners.forEach((listener) => listener())
}

const hide = () => {
  isVisible = false
  listeners.forEach((listener) => listener())
}

export function useIsDevRendering() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export const devRenderIndicator = {
  show,
  hide,
}
