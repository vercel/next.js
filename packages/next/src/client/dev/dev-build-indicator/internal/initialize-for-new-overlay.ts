/*
 * Singleton store to track whether the app is currently being built
 * Used by the dev tools indicator of the new overlay to show build status
 */

import { devBuildIndicator } from './dev-build-indicator'
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

export function useIsDevBuilding() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function initializeForNewOverlay() {
  devBuildIndicator.show = () => {
    isVisible = true
    listeners.forEach((listener) => listener())
  }

  devBuildIndicator.hide = () => {
    isVisible = false
    listeners.forEach((listener) => listener())
  }
}
