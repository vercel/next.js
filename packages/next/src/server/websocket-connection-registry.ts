import type { WebSocketTransportConnection } from './websocket-upgrade'

export type WebSocketRegistryConnection = WebSocketTransportConnection

const REGISTRY_SYMBOL = Symbol.for('next.websocket.connection-registry')
const ROUTE_LEASES_SYMBOL = Symbol.for(
  'next.websocket.connection-registry-route-leases'
)
const CLOSED_SCOPES_SYMBOL = Symbol.for(
  'next.websocket.closed-connection-registry-scopes'
)
const SCOPE_DRAINS_SYMBOL = Symbol.for(
  'next.websocket.connection-registry-scope-drains'
)
const TASKS_SYMBOL = Symbol.for('next.websocket.connection-registry-tasks')
const TASK_FAILURES_SYMBOL = Symbol.for(
  'next.websocket.connection-registry-task-failures'
)
const ABANDONED_TASKS_SYMBOL = Symbol.for(
  'next.websocket.connection-registry-abandoned-tasks'
)
const TASK_ADMISSION_CLOSED_SCOPES_SYMBOL = Symbol.for(
  'next.websocket.connection-registry-task-admission-closed-scopes'
)
const CLOSE_GRACE_PERIOD_MS = 5_000
const TERMINATE_CLOSE_EVENT_GRACE_PERIOD_MS = 1_000

type WebSocketRouteState = {
  readonly peers: Set<WebSocketRegistryConnection>
  leases: number
}
type WebSocketScopeRegistry = {
  readonly peers: Set<WebSocketRegistryConnection>
  readonly routes: Map<string, WebSocketRouteState>
}
type ScopedRegistry = WeakMap<object, WebSocketScopeRegistry>
type WebSocketRouteLeaseState = {
  readonly scope: object
  readonly bundlePath: string
  readonly route: WebSocketRouteState
  released: boolean
}
type WebSocketRouteLeases = WeakMap<
  WebSocketRouteLease,
  WebSocketRouteLeaseState
>
type ClosedScopes = WeakMap<object, number>
type ScopeDrains = WeakMap<object, Promise<void>>
type ScopedTasks = WeakMap<object, Set<Promise<void>>>
type ScopedTaskFailureState = {
  nextOrder: number
  failures: Array<{ order: number; error: unknown }>
}
type ScopedTaskFailures = WeakMap<object, ScopedTaskFailureState>
type ScopedAbandonedTasks = WeakMap<object, WeakSet<Promise<void>>>
type TaskAdmissionClosedScopes = WeakSet<object>

function getScopedRegistry(): ScopedRegistry {
  const globalRegistry = globalThis as typeof globalThis & {
    [REGISTRY_SYMBOL]?: ScopedRegistry
  }
  return (globalRegistry[REGISTRY_SYMBOL] ??= new WeakMap())
}

function getScopeRegistry(
  scope: object,
  create: boolean
): WebSocketScopeRegistry | undefined {
  const scopedRegistry = getScopedRegistry()
  let registry = scopedRegistry.get(scope)
  if (!registry && create) {
    registry = { peers: new Set(), routes: new Map() }
    scopedRegistry.set(scope, registry)
  }
  return registry
}

function getWebSocketRouteLeases(): WebSocketRouteLeases {
  const globalRegistry = globalThis as typeof globalThis & {
    [ROUTE_LEASES_SYMBOL]?: WebSocketRouteLeases
  }
  return (globalRegistry[ROUTE_LEASES_SYMBOL] ??= new WeakMap())
}

function pruneScopeRegistry(
  scope: object,
  registry: WebSocketScopeRegistry
): void {
  if (registry.peers.size === 0 && registry.routes.size === 0) {
    const scopedRegistry = getScopedRegistry()
    if (scopedRegistry.get(scope) === registry) scopedRegistry.delete(scope)
  }
}

function pruneRouteState(
  scope: object,
  bundlePath: string,
  route: WebSocketRouteState
): void {
  if (route.leases !== 0 || route.peers.size !== 0) return
  const registry = getScopeRegistry(scope, false)
  if (!registry || registry.routes.get(bundlePath) !== route) return
  registry.routes.delete(bundlePath)
  pruneScopeRegistry(scope, registry)
}

function getClosedScopes(): ClosedScopes {
  const globalRegistry = globalThis as typeof globalThis & {
    [CLOSED_SCOPES_SYMBOL]?: ClosedScopes
  }
  return (globalRegistry[CLOSED_SCOPES_SYMBOL] ??= new WeakMap())
}

function getScopeDrains(): ScopeDrains {
  const globalRegistry = globalThis as typeof globalThis & {
    [SCOPE_DRAINS_SYMBOL]?: ScopeDrains
  }
  return (globalRegistry[SCOPE_DRAINS_SYMBOL] ??= new WeakMap())
}

function getScopedTasks(): ScopedTasks {
  const globalRegistry = globalThis as typeof globalThis & {
    [TASKS_SYMBOL]?: ScopedTasks
  }
  return (globalRegistry[TASKS_SYMBOL] ??= new WeakMap())
}

function getScopedTaskFailures(): ScopedTaskFailures {
  const globalRegistry = globalThis as typeof globalThis & {
    [TASK_FAILURES_SYMBOL]?: ScopedTaskFailures
  }
  return (globalRegistry[TASK_FAILURES_SYMBOL] ??= new WeakMap())
}

function getAbandonedTasks(scope: object): WeakSet<Promise<void>> {
  const globalRegistry = globalThis as typeof globalThis & {
    [ABANDONED_TASKS_SYMBOL]?: ScopedAbandonedTasks
  }
  const scopedTasks = (globalRegistry[ABANDONED_TASKS_SYMBOL] ??= new WeakMap())
  let tasks = scopedTasks.get(scope)
  if (!tasks) {
    tasks = new WeakSet()
    scopedTasks.set(scope, tasks)
  }
  return tasks
}

function getTaskAdmissionClosedScopes(): TaskAdmissionClosedScopes {
  const globalRegistry = globalThis as typeof globalThis & {
    [TASK_ADMISSION_CLOSED_SCOPES_SYMBOL]?: TaskAdmissionClosedScopes
  }
  return (globalRegistry[TASK_ADMISSION_CLOSED_SCOPES_SYMBOL] ??= new WeakSet())
}

function observeAbandonedTask(task: Promise<void>, scope: object): void {
  const abandonedTasks = getAbandonedTasks(scope)
  if (abandonedTasks.has(task)) return
  abandonedTasks.add(task)
  void task.then(
    () => abandonedTasks.delete(task),
    (error) => {
      if (!abandonedTasks.has(task)) return
      console.error(
        'WebSocket lifecycle task failed after shutdown completed:',
        error
      )
    }
  )
}

/** Tracks detached connection-hook work for bounded scope shutdown. */
export function trackWebSocketTask(task: Promise<void>, scope: object): void {
  if (getTaskAdmissionClosedScopes().has(scope)) {
    observeAbandonedTask(task, scope)
    return
  }

  const scopedTasks = getScopedTasks()
  let tasks = scopedTasks.get(scope)
  if (!tasks) {
    tasks = new Set()
    scopedTasks.set(scope, tasks)
  }
  if (tasks.has(task)) return
  tasks.add(task)

  const scopedFailures = getScopedTaskFailures()
  let failureState = scopedFailures.get(scope)
  if (!failureState) {
    failureState = { nextOrder: 0, failures: [] }
    scopedFailures.set(scope, failureState)
  }
  const order = failureState.nextOrder++

  const cleanup = () => {
    tasks!.delete(task)
    if (tasks!.size === 0 && scopedTasks.get(scope) === tasks) {
      scopedTasks.delete(scope)
    }
  }
  void task.then(
    () => {
      getAbandonedTasks(scope).delete(task)
      cleanup()
    },
    (error) => {
      if (getAbandonedTasks(scope).has(task)) {
        console.error(
          'WebSocket lifecycle task failed after shutdown completed:',
          error
        )
      } else if (getClosedScopes().has(scope)) {
        failureState.failures.push({ order, error })
      } else {
        console.error('Failed to complete WebSocket lifecycle task:', error)
      }
      cleanup()
    }
  )
}

export interface WebSocketScopeLease {
  release(): void
}

/** Opaque admission token for one resolved App Route generation. */
export interface WebSocketRouteLease {
  release(): void
}

export interface WebSocketRouteLeaseSocket {
  readonly destroyed: boolean
  readonly readableEnded: boolean
  readonly writableEnded: boolean
  once(event: 'close' | 'end', listener: () => void): unknown
  off(event: 'close' | 'end', listener: () => void): unknown
}

export interface WebSocketRouteLeaseOwnership {
  isSocketEnded(): boolean
  release(): unknown[]
}

export function getWebSocketRouteBundlePath(page: string): string {
  const normalizedPage = page.replaceAll('\\', '/')
  return `app${normalizedPage.startsWith('/') ? '' : '/'}${normalizedPage}`
}

/** Admits one in-flight upgrade into a server scope's bounded shutdown. */
export function tryAcquireWebSocketScopeLease(
  scope: object
): WebSocketScopeLease | undefined {
  if (
    getClosedScopes().has(scope) ||
    getTaskAdmissionClosedScopes().has(scope)
  ) {
    return undefined
  }

  let resolve!: () => void
  const task = new Promise<void>((complete) => {
    resolve = complete
  })
  trackWebSocketTask(task, scope)

  let released = false
  return {
    release() {
      if (released) return
      released = true
      resolve()
    },
  }
}

/**
 * Pins the current generation of a resolved WebSocket App Route while its
 * module and upgrade handler are running.
 */
export function tryAcquireWebSocketRouteLease(
  scope: object,
  bundlePath: string
): WebSocketRouteLease | undefined {
  if (
    getClosedScopes().has(scope) ||
    getTaskAdmissionClosedScopes().has(scope)
  ) {
    return undefined
  }

  const registry = getScopeRegistry(scope, true)!
  let route = registry.routes.get(bundlePath)
  if (!route) {
    route = { peers: new Set(), leases: 0 }
    registry.routes.set(bundlePath, route)
  }
  route.leases++

  const lease: WebSocketRouteLease = {
    release() {
      const state = getWebSocketRouteLeases().get(lease)
      if (!state || state.released) return
      state.released = true
      state.route.leases--
      pruneRouteState(state.scope, state.bundlePath, state.route)
    },
  }
  getWebSocketRouteLeases().set(lease, {
    scope,
    bundlePath,
    route,
    released: false,
  })
  return lease
}

export function isWebSocketRouteLeaseCurrent(
  lease: WebSocketRouteLease
): boolean {
  const state = getWebSocketRouteLeases().get(lease)
  if (
    !state ||
    state.released ||
    getClosedScopes().has(state.scope) ||
    getTaskAdmissionClosedScopes().has(state.scope)
  ) {
    return false
  }
  return (
    getScopeRegistry(state.scope, false)?.routes.get(state.bundlePath) ===
    state.route
  )
}

/** Releases a route lease on disconnect without letting listener cleanup win. */
export function ownWebSocketRouteLease(
  lease: WebSocketRouteLease,
  socket: WebSocketRouteLeaseSocket
): WebSocketRouteLeaseOwnership {
  const releaseLease = () => lease.release()
  let ownershipReleased = false
  const ownership: WebSocketRouteLeaseOwnership = {
    isSocketEnded() {
      return socket.destroyed || socket.readableEnded || socket.writableEnded
    },
    release() {
      if (ownershipReleased) return []
      ownershipReleased = true

      // The lease must be released even if a user-visible EventEmitter hook
      // makes listener removal throw.
      lease.release()
      const failures: unknown[] = []
      for (const event of ['close', 'end'] as const) {
        try {
          socket.off(event, releaseLease)
        } catch (error) {
          failures.push(error)
        }
      }
      return failures
    },
  }

  try {
    socket.once('close', releaseLease)
    socket.once('end', releaseLease)
    // A terminal event can happen immediately before listener installation,
    // or synchronously from a custom EventEmitter hook during installation.
    if (ownership.isSocketEnded()) releaseLease()
  } catch (error) {
    for (const cleanupError of ownership.release()) {
      console.error(
        'Failed to release a WebSocket route lease listener:',
        cleanupError
      )
    }
    throw error
  }

  return ownership
}

async function waitForWebSocketTasks(scope: object): Promise<void> {
  const scopedTasks = getScopedTasks()
  let timeout: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timeout = setTimeout(() => resolve('timeout'), CLOSE_GRACE_PERIOD_MS)
  })

  try {
    while (true) {
      const tasks = Array.from(scopedTasks.get(scope) ?? [])
      if (tasks.length === 0) break
      const result = await Promise.race([
        Promise.allSettled(tasks).then(() => 'settled' as const),
        timeoutPromise,
      ])
      if (result === 'timeout') {
        getTaskAdmissionClosedScopes().add(scope)
        const currentTasks = scopedTasks.get(scope)
        if (currentTasks) {
          const abandonedTasks = getAbandonedTasks(scope)
          for (const task of currentTasks) abandonedTasks.add(task)
        }
        scopedTasks.delete(scope)
        break
      }
    }
  } finally {
    if (timeout) clearTimeout(timeout)
  }

  // No task can interleave between the final synchronous empty check and this
  // latch. Work offered after the first terminal drain stays observed for
  // diagnostics without reopening a shutdown which has already completed.
  getTaskAdmissionClosedScopes().add(scope)

  const failureState = getScopedTaskFailures().get(scope)
  const failures = (failureState?.failures.splice(0) ?? [])
    .sort((left, right) => left.order - right.order)
    .map(({ error }) => error)
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, 'WebSocket shutdown tasks failed', {
      cause: failures[0],
    })
  }
}

function waitForCloseOrTerminate(
  connection: WebSocketRegistryConnection,
  code: number
): Promise<unknown[]> {
  const failures: unknown[] = []
  const addFailure = (error: unknown) => {
    if (!failures.includes(error)) failures.push(error)
  }

  return new Promise((resolve) => {
    let settled = false
    let timeout: NodeJS.Timeout | undefined
    let removeCloseListener: (() => void) | undefined

    const getReadyState = (): number | undefined => {
      try {
        return connection.getReadyState()
      } catch (error) {
        addFailure(error)
        return undefined
      }
    }

    const finish = () => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      timeout = undefined
      const remove = removeCloseListener
      removeCloseListener = undefined
      if (remove) {
        try {
          remove()
        } catch (error) {
          addFailure(error)
        }
      }
      resolve(failures)
    }

    if (getReadyState() === 3) {
      finish()
      return
    }

    let closeDuringListenerRegistration = false
    let registeringCloseListener = true
    try {
      const remove = connection.onClose(() => {
        if (registeringCloseListener) {
          closeDuringListenerRegistration = true
        } else {
          finish()
        }
      })
      if (typeof remove === 'function') {
        removeCloseListener = remove
      } else {
        addFailure(
          new TypeError(
            'WebSocket lifecycle onClose() must return a cleanup function.'
          )
        )
      }
    } catch (error) {
      addFailure(error)
    } finally {
      registeringCloseListener = false
    }

    if (closeDuringListenerRegistration) {
      finish()
      return
    }

    const terminate = () => {
      if (settled) return
      if (timeout) clearTimeout(timeout)
      timeout = undefined

      if (getReadyState() === 3) {
        finish()
        return
      }
      try {
        connection.terminate()
      } catch (error) {
        addFailure(error)
        finish()
        return
      }
      if (settled) return
      if (getReadyState() === 3) {
        finish()
        return
      }
      timeout = setTimeout(finish, TERMINATE_CLOSE_EVENT_GRACE_PERIOD_MS)
    }

    timeout = setTimeout(terminate, CLOSE_GRACE_PERIOD_MS)
    if (!removeCloseListener) {
      terminate()
      return
    }

    const readyState = getReadyState()
    if (readyState === 3) {
      finish()
      return
    }
    if (readyState !== 2) {
      try {
        connection.close(code)
      } catch (error) {
        addFailure(error)
        terminate()
      }
    }
  })
}

async function closeConnections(
  connections: Iterable<WebSocketRegistryConnection>,
  code: number
): Promise<void> {
  const connectionFailures = await Promise.all(
    Array.from(connections, (connection) =>
      waitForCloseOrTerminate(connection, code)
    )
  )
  const failures = connectionFailures.flat()
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      'Failed to close WebSocket connections',
      {
        cause: failures[0],
      }
    )
  }
}

export function registerWebSocketPeer(
  connection: WebSocketRegistryConnection,
  scope: object
): boolean {
  const shutdownCode = getClosedScopes().get(scope)
  if (shutdownCode !== undefined) {
    trackWebSocketTask(closeConnections([connection], shutdownCode), scope)
    return false
  }

  getScopeRegistry(scope, true)!.peers.add(connection)
  return true
}

export function unregisterWebSocketPeer(
  connection: WebSocketRegistryConnection,
  scope: object
): void {
  const registry = getScopeRegistry(scope, false)
  if (!registry) return
  registry.peers.delete(connection)
  pruneScopeRegistry(scope, registry)
}

/** Registers a peer only if its route generation is still current. */
export function registerWebSocketRoutePeer(
  connection: WebSocketRegistryConnection,
  lease: WebSocketRouteLease
): boolean {
  const state = getWebSocketRouteLeases().get(lease)
  if (!state) {
    try {
      connection.close(1012)
    } catch {
      try {
        connection.terminate()
      } catch {}
    }
    return false
  }

  const shutdownCode = getClosedScopes().get(state.scope)
  if (shutdownCode !== undefined) {
    trackWebSocketTask(
      closeConnections([connection], shutdownCode),
      state.scope
    )
    return false
  }
  if (state.released) {
    trackWebSocketTask(closeConnections([connection], 1012), state.scope)
    return false
  }

  const registry = getScopeRegistry(state.scope, false)
  if (!registry || registry.routes.get(state.bundlePath) !== state.route) {
    trackWebSocketTask(closeConnections([connection], 1012), state.scope)
    return false
  }

  state.route.peers.add(connection)
  return true
}

export function unregisterWebSocketRoutePeer(
  connection: WebSocketRegistryConnection,
  lease: WebSocketRouteLease
): void {
  const state = getWebSocketRouteLeases().get(lease)
  if (!state) return
  state.route.peers.delete(connection)
  pruneRouteState(state.scope, state.bundlePath, state.route)
}

export function isWebSocketRouteActive(
  scope: object,
  bundlePath: string
): boolean {
  const route = getScopeRegistry(scope, false)?.routes.get(bundlePath)
  return Boolean(route && (route.leases !== 0 || route.peers.size !== 0))
}

function takeWebSocketRouteConnections(
  scope: object,
  bundlePath: string
): Set<WebSocketRegistryConnection> | undefined {
  const registry = getScopeRegistry(scope, false)
  const route = registry?.routes.get(bundlePath)
  if (!registry || !route) return undefined

  // Removing the state before closing its peers makes every in-flight lease
  // stale. A new request can create a fresh state without being captured by
  // this reload.
  registry.routes.delete(bundlePath)
  const connections = new Set(route.peers)
  route.peers.clear()
  pruneScopeRegistry(scope, registry)
  return connections
}

function takeWebSocketScopeConnections(
  scope: object
): Set<WebSocketRegistryConnection> {
  const registry = getScopeRegistry(scope, false)
  const connections = new Set(registry?.peers ?? [])
  if (!registry) return connections

  registry.peers.clear()
  for (const route of registry.routes.values()) {
    for (const connection of route.peers) connections.add(connection)
    route.peers.clear()
  }
  registry.routes.clear()
  getScopedRegistry().delete(scope)
  return connections
}

function trackConnectionReload(
  scope: object,
  connections: Set<WebSocketRegistryConnection>,
  code: number
): Promise<void> {
  if (connections.size === 0) return Promise.resolve()
  const closing = closeConnections(connections, code)
  trackWebSocketTask(closing, scope)
  return closing
}

export function closeWebSocketRoute(
  scope: object,
  bundlePath: string,
  code: number = 1012
): Promise<void> {
  const connections = takeWebSocketRouteConnections(scope, bundlePath)
  return connections
    ? trackConnectionReload(scope, connections, code)
    : Promise.resolve()
}

/** Reloads every current route without permanently closing the server scope. */
export function reloadWebSocketScope(
  scope: object,
  code: number = 1012
): Promise<void> {
  return trackConnectionReload(
    scope,
    takeWebSocketScopeConnections(scope),
    code
  )
}

export function closeWebSocketScope(
  scope: object,
  code: number = 1001
): Promise<void> {
  const closedScopes = getClosedScopes()
  const shutdownCode = closedScopes.get(scope) ?? code
  closedScopes.set(scope, shutdownCode)

  const scopeDrains = getScopeDrains()
  const existing = scopeDrains.get(scope)
  if (existing) return existing

  const drain = Promise.resolve().then(async () => {
    const failures: unknown[] = []
    const addFailure = (error: unknown) => {
      if (!failures.includes(error)) failures.push(error)
    }

    const connections = takeWebSocketScopeConnections(scope)

    try {
      await closeConnections(connections, shutdownCode)
    } catch (error) {
      addFailure(error)
    }
    try {
      await waitForWebSocketTasks(scope)
    } catch (error) {
      addFailure(error)
    }

    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Failed to close WebSocket scope', {
        cause: failures[0],
      })
    }
  })
  scopeDrains.set(scope, drain)
  return drain
}

export async function settleWebSocketShutdownStages(
  stages: ReadonlyArray<() => void | PromiseLike<void>>,
  message: string
): Promise<void> {
  const failures: unknown[] = []
  for (const stage of stages) {
    try {
      await Promise.resolve().then(stage)
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, message, { cause: failures[0] })
  }
}
