import type {
  FlightRouterState,
  Segment,
} from '../../shared/lib/app-router-types'
import {
  DEFAULT_SEGMENT_KEY,
  isGroupSegment,
  NOT_FOUND_SEGMENT_KEY,
} from '../../shared/lib/segment'
import { segmentToSourcePagePathname } from './router-reducer/compute-changed-path'
import type {
  ClientInstrumentationHooks,
  ClientInstrumentationModules,
  RouterTransitionPrefetch,
  RouterTransitionPrefetchIntent,
  RouterTransitionType,
} from '../router-transition-types'

type RouterTransitionRecord = {
  id: string
  resolvedUrl: string
  type: RouterTransitionType
  prefetch: RouterTransitionPrefetch
  committed: boolean
}

let instrumentationModules: readonly ClientInstrumentationHooks[] = []
let nextTransitionId = 0
let activeTransition: RouterTransitionRecord | null = null

export function initializeRouterTransitionModules(
  modules: ClientInstrumentationModules
): void {
  instrumentationModules = modules.filter(
    (module): module is ClientInstrumentationHooks => module != null
  )

  if (
    !process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS &&
    process.env.NODE_ENV !== 'production' &&
    instrumentationModules.some(
      (hooks) =>
        typeof hooks.unstable_onRouterTransitionCommit === 'function' ||
        typeof hooks.unstable_onRouterTransitionAbort === 'function'
    )
  ) {
    console.warn(
      'Router transition lifecycle hooks in instrumentation-client require ' +
        '`experimental.instrumentationClientRouterTransitionEvents` to be enabled.'
    )
  }
}

function timestamp(): number {
  return performance.timeOrigin + performance.now()
}

function callHooks(invoke: (hooks: ClientInstrumentationHooks) => void): void {
  for (const hooks of instrumentationModules) {
    try {
      invoke(hooks)
    } catch (error) {
      console.error(
        'An instrumentation-client router transition hook failed',
        error
      )
    }
  }
}

function hasLifecycleInstrumentation(): boolean {
  return instrumentationModules.some(
    (hooks) =>
      typeof hooks.onRouterTransitionStart === 'function' ||
      typeof hooks.unstable_onRouterTransitionCommit === 'function' ||
      typeof hooks.unstable_onRouterTransitionAbort === 'function'
  )
}

function getActiveTransition(id: string | null): RouterTransitionRecord | null {
  return id !== null && activeTransition?.id === id ? activeTransition : null
}

export function startRouterTransition(
  url: string,
  type: RouterTransitionType,
  fromTree: FlightRouterState,
  prefetchIntent: RouterTransitionPrefetchIntent
): string | null {
  if (!process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    callHooks((hooks) => hooks.onRouterTransitionStart?.(url, type))
    return null
  }

  if (!hasLifecycleInstrumentation()) {
    return null
  }

  if (activeTransition !== null) {
    abortRouterTransition(activeTransition.id, 'superseded')
  }

  const id = `${Date.now().toString(36)}-${(++nextTransitionId).toString(36)}`
  const record: RouterTransitionRecord = {
    id,
    resolvedUrl: url,
    type,
    prefetch: 'none',
    committed: false,
  }
  activeTransition = record

  callHooks((hooks) =>
    hooks.onRouterTransitionStart?.(url, type, {
      id,
      timestamp: timestamp(),
      fromRoutes: getActiveRoutePaths(fromTree),
      prefetchIntent,
    })
  )
  return id
}

export function setRouterTransitionPrefetch(
  id: string | null,
  prefetch: RouterTransitionPrefetch
): void {
  const record = getActiveTransition(id)
  if (record !== null) {
    // A route prediction can provide a tree after the prefetch cache misses.
    // Preserve the miss instead of later reclassifying it as a shell hit.
    if (record.prefetch !== 'miss') {
      record.prefetch = prefetch
    }
  }
}

export function commitRouterTransition(
  id: string | null,
  url: string,
  tree: FlightRouterState
): void {
  const record = getActiveTransition(id)
  if (record === null || record.committed) {
    return
  }

  record.committed = true
  record.resolvedUrl = url
  callHooks((hooks) =>
    hooks.unstable_onRouterTransitionCommit?.(url, record.type, {
      id: record.id,
      timestamp: timestamp(),
      routes: getActiveRoutePaths(tree),
      prefetch: record.prefetch,
    })
  )
  activeTransition = null
}

export function abortRouterTransition(
  id: string | null,
  reason: 'superseded' | 'hard-navigation' | 'error',
  url?: string
): void {
  const record = getActiveTransition(id)
  if (record === null) {
    return
  }

  record.resolvedUrl = url ?? record.resolvedUrl
  activeTransition = null
  callHooks((hooks) =>
    hooks.unstable_onRouterTransitionAbort?.(record.resolvedUrl, record.type, {
      id: record.id,
      timestamp: timestamp(),
      reason,
    })
  )
}

function classifySegment(segment: Segment): {
  path: string | null
  isPage: boolean
} {
  const sourceSegment = segmentToSourcePagePathname(segment)
  if (sourceSegment === 'page') {
    return { path: null, isPage: true }
  }
  if (
    sourceSegment === '' ||
    sourceSegment === '(__SLOT__)' ||
    isGroupSegment(sourceSegment)
  ) {
    return { path: null, isPage: false }
  }
  if (sourceSegment === DEFAULT_SEGMENT_KEY) {
    return { path: 'default', isPage: false }
  }
  if (sourceSegment === NOT_FOUND_SEGMENT_KEY) {
    return { path: '_not-found', isPage: false }
  }
  return { path: sourceSegment, isPage: false }
}

export function getActiveRoutePaths(tree: FlightRouterState): string[] {
  const routes: Array<{ path: string; primary: boolean }> = []

  function visit(
    node: FlightRouterState,
    segments: string[],
    primary: boolean
  ): void {
    const segment = classifySegment(node[0])
    const nextSegments =
      segment.path === null ? segments : [...segments, segment.path]
    const parallelRoutes = node[1]
    const keys = Object.keys(parallelRoutes)

    if (keys.length === 0 || segment.isPage) {
      routes.push({
        path: `/${nextSegments.join('/')}`,
        primary,
      })
      return
    }

    if (parallelRoutes.children !== undefined) {
      visit(parallelRoutes.children, nextSegments, primary)
    }

    for (const key of keys.sort()) {
      if (key === 'children') {
        continue
      }
      visit(parallelRoutes[key], [...nextSegments, `@${key}`], false)
    }
  }

  visit(tree, [], true)
  return routes
    .sort((a, b) => {
      if (a.primary !== b.primary) {
        return a.primary ? -1 : 1
      }
      return a.path.localeCompare(b.path)
    })
    .map((route) => route.path)
}
