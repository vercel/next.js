import type { EventEmitter } from 'node:events'

type UpgradeListenerOwnershipState = {
  ownListenerRegistered: boolean
  externalListenerSeen: boolean
  onNewListener?: (eventName: string | symbol, listener: unknown) => void
}

export interface WebSocketUpgradeListenerOwnershipTracker {
  isExclusiveOwner(): boolean
  dispose(): void
}

function hasExternalUpgradeListener(
  server: EventEmitter,
  ownListener: object
): boolean {
  const listeners = server.listeners('upgrade')
  return listeners.length !== 1 || listeners[0] !== ownListener
}

function markExternalUpgradeListener(
  server: EventEmitter,
  state: UpgradeListenerOwnershipState
) {
  if (state.externalListenerSeen) return

  state.externalListenerSeen = true
  if (state.onNewListener) {
    server.removeListener('newListener', state.onNewListener)
    state.onNewListener = undefined
  }
}

/**
 * Tracks whether a server can safely give Next.js exclusive ownership of a
 * WebSocket upgrade. The result is deliberately monotonic: after an external
 * upgrade listener has existed, WebSocket requests remain delegated for that
 * server's lifetime, even if the listener is later removed.
 */
export function createWebSocketUpgradeListenerOwnershipTracker(
  server: EventEmitter,
  ownListener: object
): WebSocketUpgradeListenerOwnershipTracker {
  const state: UpgradeListenerOwnershipState = {
    ownListenerRegistered: false,
    externalListenerSeen: server.listenerCount('upgrade') !== 0,
  }

  if (!state.externalListenerSeen) {
    state.onNewListener = (eventName, listener) => {
      if (eventName !== 'upgrade') return
      if (listener === ownListener && !state.ownListenerRegistered) {
        state.ownListenerRegistered = true
        return
      }
      markExternalUpgradeListener(server, state)
    }
    server.prependListener('newListener', state.onNewListener)
  }

  // Scan after installing the observer as well. An existing `newListener`
  // callback runs before our observer is inserted and can synchronously add an
  // upgrade listener in that gap.
  if (
    server.listenerCount('upgrade') !== 0 &&
    hasExternalUpgradeListener(server, ownListener)
  ) {
    markExternalUpgradeListener(server, state)
  }

  let disposed = false
  return {
    isExclusiveOwner() {
      if (disposed) return false
      // Retain a live scan as a fallback if embedding code removed the
      // observer.
      if (
        !state.externalListenerSeen &&
        hasExternalUpgradeListener(server, ownListener)
      ) {
        markExternalUpgradeListener(server, state)
      }
      return !state.externalListenerSeen
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (state.onNewListener) {
        server.removeListener('newListener', state.onNewListener)
        state.onNewListener = undefined
      }
    },
  }
}
