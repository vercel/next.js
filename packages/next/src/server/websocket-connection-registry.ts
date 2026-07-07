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

function closeConnections(connections: Iterable<WebSocketPeer>, code: number) {
  const remaining = new Set<WebSocketPeer>()

  for (const peer of connections) {
    const readyState = peer.websocket.readyState
    if (readyState === 2 || readyState === 3) continue

    remaining.add(peer)
    try {
      peer.close(code)
    } catch {
      remaining.delete(peer)
    }
  }

  if (remaining.size > 0) {
    const timeout = setTimeout(() => {
      for (const peer of remaining) {
        if (peer.websocket.readyState === 3) continue
        peer.terminate()
      }
    }, CLOSE_GRACE_PERIOD_MS)
    timeout.unref()
  }
}

export function closeWebSocketsForBundle(
  bundlePath: string,
  code: number = 1012
): void {
  const registry = getRegistry()
  const connections = registry.get(bundlePath)
  if (!connections) return

  registry.delete(bundlePath)
  closeConnections(connections, code)
}

export function closeAllWebSockets(code: number = 1001): void {
  const registry = getRegistry()
  const connections: WebSocketPeer[] = []
  for (const bundleConnections of registry.values()) {
    connections.push(...bundleConnections)
  }
  registry.clear()
  closeConnections(connections, code)
}
