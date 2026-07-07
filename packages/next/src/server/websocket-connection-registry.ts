import type { WebSocketPeer } from './web/spec-extension/response'

const REGISTRY_SYMBOL = Symbol.for('next.websocket.connection-registry')
const CLOSE_GRACE_PERIOD_MS = 5_000

type Registry = Map<string, Set<WebSocketPeer>>

function getRegistry(): Registry {
  const globalRegistry = globalThis as typeof globalThis & {
    [REGISTRY_SYMBOL]?: Registry
  }
  return (globalRegistry[REGISTRY_SYMBOL] ??= new Map())
}

export function registerWebSocketPeer(
  bundlePath: string,
  peer: WebSocketPeer
): void {
  const registry = getRegistry()
  let connections = registry.get(bundlePath)
  if (!connections) {
    connections = new Set()
    registry.set(bundlePath, connections)
  }

  connections.add(peer)
}

export function unregisterWebSocketPeer(
  bundlePath: string,
  peer: WebSocketPeer
): void {
  const registry = getRegistry()
  const connections = registry.get(bundlePath)
  if (!connections) return

  connections.delete(peer)
  if (connections.size === 0) registry.delete(bundlePath)
}

function waitForCloseOrTerminate(peer: WebSocketPeer, code: number) {
  const websocket = peer.websocket as typeof peer.websocket & {
    once?: (event: 'close', listener: () => void) => void
    off?: (event: 'close', listener: () => void) => void
    addEventListener?: (
      event: 'close',
      listener: () => void,
      options?: { once?: boolean }
    ) => void
    removeEventListener?: (event: 'close', listener: () => void) => void
  }

  return new Promise<void>((resolve) => {
    let settled = false
    let timeout: NodeJS.Timeout | undefined

    const cleanup = () => {
      websocket.off?.('close', finish)
      websocket.removeEventListener?.('close', finish)
      if (timeout) clearTimeout(timeout)
    }

    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    if (websocket.readyState === 3) {
      finish()
      return
    }

    websocket.once?.('close', finish)
    websocket.addEventListener?.('close', finish, { once: true })

    timeout = setTimeout(() => {
      try {
        if (websocket.readyState !== 3) {
          peer.terminate()
        }
      } finally {
        finish()
      }
    }, CLOSE_GRACE_PERIOD_MS)

    if (websocket.readyState !== 2) {
      try {
        peer.close(code)
      } catch {
        try {
          peer.terminate()
        } finally {
          finish()
        }
      }
    }
  })
}

function closeConnections(
  connections: Iterable<WebSocketPeer>,
  code: number
): Promise<void> {
  const pending: Array<Promise<void>> = []

  for (const peer of connections) {
    if (peer.websocket.readyState === 3) continue
    pending.push(waitForCloseOrTerminate(peer, code))
  }

  return Promise.all(pending).then(() => {})
}

export function closeWebSocketsForBundle(
  bundlePath: string,
  code: number = 1012
): Promise<void> {
  const registry = getRegistry()
  const connections = registry.get(bundlePath)
  if (!connections) return Promise.resolve()

  registry.delete(bundlePath)
  return closeConnections(connections, code)
}

export function closeAllWebSockets(code: number = 1001): Promise<void> {
  const registry = getRegistry()
  const connections: WebSocketPeer[] = []
  for (const bundleConnections of registry.values()) {
    connections.push(...bundleConnections)
  }
  registry.clear()
  return closeConnections(connections, code)
}
