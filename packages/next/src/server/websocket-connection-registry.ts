import type { WebSocketPeer } from './web/spec-extension/response'

const REGISTRY_SYMBOL = Symbol.for('next.websocket.connection-registry')
const DEFAULT_SCOPE = Symbol.for('next.websocket.default-registry-scope')
const CLOSE_GRACE_PERIOD_MS = 5_000

type Registry = Map<string, Set<WebSocketPeer>>
type ScopedRegistry = Map<symbol, Registry>

function getScopedRegistry(): ScopedRegistry {
  const globalRegistry = globalThis as typeof globalThis & {
    [REGISTRY_SYMBOL]?: ScopedRegistry
  }
  return (globalRegistry[REGISTRY_SYMBOL] ??= new Map())
}

function getRegistry(scope: symbol, create: boolean): Registry | undefined {
  const scopedRegistry = getScopedRegistry()
  let registry = scopedRegistry.get(scope)
  if (!registry && create) {
    registry = new Map()
    scopedRegistry.set(scope, registry)
  }
  return registry
}

export function registerWebSocketPeer(
  bundlePath: string,
  peer: WebSocketPeer,
  scope: symbol = DEFAULT_SCOPE
): void {
  const registry = getRegistry(scope, true)!
  let connections = registry.get(bundlePath)
  if (!connections) {
    connections = new Set()
    registry.set(bundlePath, connections)
  }

  connections.add(peer)
}

export function unregisterWebSocketPeer(
  bundlePath: string,
  peer: WebSocketPeer,
  scope: symbol = DEFAULT_SCOPE
): void {
  const registry = getRegistry(scope, false)
  if (!registry) return
  const connections = registry.get(bundlePath)
  if (!connections) return

  connections.delete(peer)
  if (connections.size === 0) {
    registry.delete(bundlePath)
    if (registry.size === 0) getScopedRegistry().delete(scope)
  }
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
      } catch {
        // A transport may throw while already tearing down. The registry must
        // still settle so process shutdown cannot be interrupted.
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
        } catch {
          // Treat an already-failed transport as closed for registry cleanup.
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
  code: number = 1012,
  scope?: symbol
): Promise<void> {
  const connections: WebSocketPeer[] = []
  const scopedRegistry = getScopedRegistry()
  const scopes = scope
    ? [[scope, scopedRegistry.get(scope)] as const]
    : scopedRegistry

  for (const [registryScope, registry] of scopes) {
    const bundleConnections = registry?.get(bundlePath)
    if (!bundleConnections) continue

    connections.push(...bundleConnections)
    registry!.delete(bundlePath)
    if (registry!.size === 0) scopedRegistry.delete(registryScope)
  }

  return closeConnections(connections, code)
}

export function closeAllWebSockets(
  code: number = 1001,
  scope?: symbol
): Promise<void> {
  const scopedRegistry = getScopedRegistry()
  const connections: WebSocketPeer[] = []
  const scopes = scope
    ? [[scope, scopedRegistry.get(scope)] as const]
    : scopedRegistry

  for (const [registryScope, registry] of scopes) {
    if (!registry) continue
    for (const bundleConnections of registry.values()) {
      connections.push(...bundleConnections)
    }
    registry.clear()
    scopedRegistry.delete(registryScope)
  }

  return closeConnections(connections, code)
}
