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
  RouterTransitionPrefetchIntent,
  RouterTransitionType,
} from '../router-transition-types'

let instrumentationModules: readonly ClientInstrumentationHooks[] = []
let nextTransitionId = 0

export function initializeRouterTransitionModules(
  modules: ClientInstrumentationModules
): void {
  instrumentationModules = modules.filter(
    (module): module is ClientInstrumentationHooks => module != null
  )
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

function timestamp(): number {
  return performance.timeOrigin + performance.now()
}

export function startRouterTransition(
  url: string,
  type: RouterTransitionType,
  fromTree: FlightRouterState,
  prefetchIntent: RouterTransitionPrefetchIntent | null
): void {
  // Positive flag check so the instrumentation-only path is removed by DCE when disabled.
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    if (
      !instrumentationModules.some(
        (hooks) => typeof hooks.onRouterTransitionStart === 'function'
      )
    ) {
      return
    }

    const id = `${Date.now().toString(36)}-${(++nextTransitionId).toString(36)}`

    callHooks((hooks) =>
      hooks.onRouterTransitionStart?.(url, type, {
        id,
        timestamp: timestamp(),
        fromRoutes: getActiveRoutePaths(fromTree),
        prefetchIntent,
      })
    )
  } else {
    callHooks((hooks) => hooks.onRouterTransitionStart?.(url, type, null))
  }
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

function getActiveRoutePaths(tree: FlightRouterState): string[] {
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
