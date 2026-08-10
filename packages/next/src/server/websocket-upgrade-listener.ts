import type { EventEmitter } from 'node:events'

type UpgradeListenerOwnershipState = {
  externalListenerSeen: boolean
  onNewListener?: (eventName: string | symbol, listener: unknown) => void
}

export interface WebSocketUpgradeListenerOwnershipTracker {
  getOwnership(): WebSocketUpgradeOwnership
  dispose(): void
}

export type WebSocketUpgradeOwnership = 'exclusive' | 'coordinated' | 'shared'

const nextOwnedUpgradeListeners = new WeakSet<object>()

/** Marks a listener so sibling Next.js custom-server instances can coordinate. */
export function markNextOwnedWebSocketUpgradeListener<T extends object>(
  listener: T
): T {
  nextOwnedUpgradeListeners.add(listener)
  return listener
}

function isNextOwnedUpgradeListener(listener: unknown): boolean {
  return (
    (typeof listener === 'object' || typeof listener === 'function') &&
    listener !== null &&
    nextOwnedUpgradeListeners.has(listener as object)
  )
}

function isOwnedUpgradeListener(
  listener: unknown,
  ownListener: object,
  additionalOwnListeners: readonly object[]
): boolean {
  return (
    listener === ownListener ||
    additionalOwnListeners.includes(listener as object)
  )
}

export function classifyWebSocketUpgradeOwnership(
  listeners: readonly unknown[] | undefined,
  ownListener: object,
  additionalOwnListeners: readonly object[] = []
): WebSocketUpgradeOwnership {
  if (!listeners || listeners.length === 0) return 'shared'
  const ownRegistered = listeners.includes(ownListener)
  if (ownRegistered) {
    if (
      listeners.every((listener) =>
        isOwnedUpgradeListener(listener, ownListener, additionalOwnListeners)
      )
    ) {
      return 'exclusive'
    }
    return listeners.every(
      (listener) =>
        isOwnedUpgradeListener(listener, ownListener, additionalOwnListeners) ||
        isNextOwnedUpgradeListener(listener)
    )
      ? 'coordinated'
      : 'shared'
  }
  let externalListenerCount = 0
  for (const listener of listeners) {
    if (
      !isOwnedUpgradeListener(listener, ownListener, additionalOwnListeners)
    ) {
      externalListenerCount++
    }
  }
  return externalListenerCount === 1 ? 'coordinated' : 'shared'
}

function hasExternalUpgradeListener(
  server: EventEmitter,
  ownListener: object,
  additionalOwnListeners: readonly object[]
): boolean {
  const listeners = server.listeners('upgrade')
  return listeners.some(
    (listener) =>
      !isOwnedUpgradeListener(listener, ownListener, additionalOwnListeners) &&
      !isNextOwnedUpgradeListener(listener)
  )
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
  ownListener: object,
  additionalOwnListeners: readonly object[] = []
): WebSocketUpgradeListenerOwnershipTracker {
  const state: UpgradeListenerOwnershipState = {
    externalListenerSeen: hasExternalUpgradeListener(
      server,
      ownListener,
      additionalOwnListeners
    ),
  }

  if (!state.externalListenerSeen) {
    state.onNewListener = (eventName, listener) => {
      if (eventName !== 'upgrade') return
      if (
        isOwnedUpgradeListener(listener, ownListener, additionalOwnListeners) ||
        isNextOwnedUpgradeListener(listener)
      ) {
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
    hasExternalUpgradeListener(server, ownListener, additionalOwnListeners)
  ) {
    markExternalUpgradeListener(server, state)
  }

  let disposed = false
  return {
    getOwnership() {
      if (disposed) return 'shared'
      // Retain a live scan as a fallback if embedding code removed the
      // observer.
      if (
        !state.externalListenerSeen &&
        hasExternalUpgradeListener(server, ownListener, additionalOwnListeners)
      ) {
        markExternalUpgradeListener(server, state)
      }
      return state.externalListenerSeen
        ? 'shared'
        : classifyWebSocketUpgradeOwnership(
            server.listeners('upgrade'),
            ownListener,
            additionalOwnListeners
          )
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
