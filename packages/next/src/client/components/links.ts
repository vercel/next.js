import type { FlightRouterState } from '../../server/app-render/types'
import type { AppRouterInstance } from '../../shared/lib/app-router-context.shared-runtime'
import { getCurrentAppRouterState } from '../../shared/lib/router/action-queue'
import { createPrefetchURL } from './app-router'
import { PrefetchKind } from './router-reducer/router-reducer-types'
import { getCurrentCacheVersion } from './segment-cache'
import { createCacheKey } from './segment-cache'
import {
  type PrefetchTask,
  PrefetchPriority,
  schedulePrefetchTask as scheduleSegmentPrefetchTask,
  cancelPrefetchTask,
  bumpPrefetchTask,
} from './segment-cache'

type LinkElement = HTMLAnchorElement | SVGAElement | HTMLFormElement

type LinkInstance = {
  router: AppRouterInstance
  kind: PrefetchKind.AUTO | PrefetchKind.FULL
  prefetchHref: string

  isVisible: boolean
  wasHoveredOrTouched: boolean

  // The most recently initiated prefetch task. It may or may not have
  // already completed.  The same prefetch task object can be reused across
  // multiple prefetches of the same link.
  prefetchTask: PrefetchTask | null

  // The cache version at the time the task was initiated. This is used to
  // determine if the cache was invalidated since the task was initiated.
  cacheVersion: number
}

// Use a WeakMap to associate a Link instance with its DOM element. This is
// used by the IntersectionObserver to track the link's visibility.
const links: WeakMap<LinkElement, LinkInstance> | Map<Element, LinkInstance> =
  typeof WeakMap === 'function' ? new WeakMap() : new Map()

// A Set of the currently visible links. We re-prefetch visible links after a
// cache invalidation, or when the current URL changes. It's a separate data
// structure from the WeakMap above because only the visible links need to
// be enumerated.
const visibleLinks: Set<LinkInstance> = new Set()

// A single IntersectionObserver instance shared by all <Link> components.
const observer: IntersectionObserver | null =
  typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(handleIntersect, {
        rootMargin: '200px',
      })
    : null

export function mountLinkInstance(
  element: LinkElement,
  href: string,
  router: AppRouterInstance,
  kind: PrefetchKind.AUTO | PrefetchKind.FULL
) {
  let prefetchUrl: URL | null = null
  try {
    prefetchUrl = createPrefetchURL(href)
    if (prefetchUrl === null) {
      // We only track the link if it's prefetchable. For example, this excludes
      // links to external URLs.
      return
    }
  } catch {
    // createPrefetchURL sometimes throws an error if an invalid URL is
    // provided, though I'm not sure if it's actually necessary.
    // TODO: Consider removing the throw from the inner function, or change it
    // to reportError. Or maybe the error isn't even necessary for automatic
    // prefetches, just navigations.
    const reportErrorFn =
      typeof reportError === 'function' ? reportError : console.error
    reportErrorFn(
      `Cannot prefetch '${href}' because it cannot be converted to a URL.`
    )
    return
  }

  const instance: LinkInstance = {
    prefetchHref: prefetchUrl.href,
    router,
    kind,
    isVisible: false,
    wasHoveredOrTouched: false,
    prefetchTask: null,
    cacheVersion: -1,
  }
  const existingInstance = links.get(element)
  if (existingInstance !== undefined) {
    // This shouldn't happen because each <Link> component should have its own
    // anchor tag instance, but it's defensive coding to avoid a memory leak in
    // case there's a logical error somewhere else.
    unmountLinkInstance(element)
  }
  links.set(element, instance)
  if (observer !== null) {
    observer.observe(element)
  }
}

export function unmountLinkInstance(element: LinkElement) {
  const instance = links.get(element)
  if (instance !== undefined) {
    links.delete(element)
    visibleLinks.delete(instance)
    const prefetchTask = instance.prefetchTask
    if (prefetchTask !== null) {
      cancelPrefetchTask(prefetchTask)
    }
  }
  if (observer !== null) {
    observer.unobserve(element)
  }
}

function handleIntersect(entries: Array<IntersectionObserverEntry>) {
  for (const entry of entries) {
    // Some extremely old browsers or polyfills don't reliably support
    // isIntersecting so we check intersectionRatio instead. (Do we care? Not
    // really. But whatever this is fine.)
    const isVisible = entry.intersectionRatio > 0
    onLinkVisibilityChanged(entry.target as HTMLAnchorElement, isVisible)
  }
}

export function onLinkVisibilityChanged(
  element: LinkElement,
  isVisible: boolean
) {
  if (process.env.NODE_ENV !== 'production') {
    // Prefetching on viewport is disabled in development for performance
    // reasons, because it requires compiling the target page.
    // TODO: Investigate re-enabling this.
    return
  }

  const instance = links.get(element)
  if (instance === undefined) {
    return
  }

  instance.isVisible = isVisible
  if (isVisible) {
    visibleLinks.add(instance)
  } else {
    visibleLinks.delete(instance)
  }
  rescheduleLinkPrefetch(instance)
}

export function onNavigationIntent(element: HTMLAnchorElement | SVGAElement) {
  const instance = links.get(element)
  if (instance === undefined) {
    return
  }
  // Prefetch the link on hover/touchstart.
  if (instance !== undefined) {
    instance.wasHoveredOrTouched = true
    rescheduleLinkPrefetch(instance)
  }
}

function rescheduleLinkPrefetch(instance: LinkInstance) {
  const existingPrefetchTask = instance.prefetchTask

  if (!instance.isVisible) {
    // Cancel any in-progress prefetch task. (If it already finished then this
    // is a no-op.)
    if (existingPrefetchTask !== null) {
      cancelPrefetchTask(existingPrefetchTask)
    }
    // We don't need to reset the prefetchTask to null upon cancellation; an
    // old task object can be rescheduled with bumpPrefetchTask. This is a
    // micro-optimization but also makes the code simpler (don't need to
    // worry about whether an old task object is stale).
    return
  }

  if (!process.env.__NEXT_CLIENT_SEGMENT_CACHE) {
    // The old prefetch implementation does not have different priority levels.
    // Just schedule a new prefetch task.
    prefetchWithOldCacheImplementation(instance)
    return
  }

  // In the Segment Cache implementation, we assign a higher priority level to
  // links that were at one point hovered or touched. Since the queue is last-
  // in-first-out, the highest priority Link is whichever one was hovered last.
  //
  // We also increase the relative priority of links whenever they re-enter the
  // viewport, as if they were being scheduled for the first time.
  const priority = instance.wasHoveredOrTouched
    ? PrefetchPriority.Intent
    : PrefetchPriority.Default
  if (existingPrefetchTask === null) {
    // Initiate a prefetch task.
    const appRouterState = getCurrentAppRouterState()
    if (appRouterState !== null) {
      const nextUrl = appRouterState.nextUrl
      const treeAtTimeOfPrefetch = appRouterState.tree
      const cacheKey = createCacheKey(instance.prefetchHref, nextUrl)
      instance.prefetchTask = scheduleSegmentPrefetchTask(
        cacheKey,
        treeAtTimeOfPrefetch,
        instance.kind === PrefetchKind.FULL,
        priority
      )
      instance.cacheVersion = getCurrentCacheVersion()
    }
  } else {
    // We already have an old task object that we can reschedule. This is
    // effectively the same as canceling the old task and creating a new one.
    bumpPrefetchTask(existingPrefetchTask, priority)
  }
}

export function pingVisibleLinks(
  nextUrl: string | null,
  tree: FlightRouterState
) {
  // For each currently visible link, cancel the existing prefetch task (if it
  // exists) and schedule a new one. This is effectively the same as if all the
  // visible links left and then re-entered the viewport.
  //
  // This is called when the Next-Url or the base tree changes, since those
  // may affect the result of a prefetch task. It's also called after a
  // cache invalidation.
  const currentCacheVersion = getCurrentCacheVersion()
  for (const instance of visibleLinks) {
    const task = instance.prefetchTask
    if (
      task !== null &&
      instance.cacheVersion === currentCacheVersion &&
      task.key.nextUrl === nextUrl &&
      task.treeAtTimeOfPrefetch === tree
    ) {
      // The cache has not been invalidated, and none of the inputs have
      // changed. Bail out.
      continue
    }
    // Something changed. Cancel the existing prefetch task and schedule a
    // new one.
    if (task !== null) {
      cancelPrefetchTask(task)
    }
    const cacheKey = createCacheKey(instance.prefetchHref, nextUrl)
    const priority = instance.wasHoveredOrTouched
      ? PrefetchPriority.Intent
      : PrefetchPriority.Default
    instance.prefetchTask = scheduleSegmentPrefetchTask(
      cacheKey,
      tree,
      instance.kind === PrefetchKind.FULL,
      priority
    )
    instance.cacheVersion = getCurrentCacheVersion()
  }
}

function prefetchWithOldCacheImplementation(instance: LinkInstance) {
  // This is the path used when the Segment Cache is not enabled.
  if (typeof window === 'undefined') {
    return
  }

  const doPrefetch = async () => {
    // note that `appRouter.prefetch()` is currently sync,
    // so we have to wrap this call in an async function to be able to catch() errors below.
    return instance.router.prefetch(instance.prefetchHref, {
      kind: instance.kind,
    })
  }

  // Prefetch the page if asked (only in the client)
  // We need to handle a prefetch error here since we may be
  // loading with priority which can reject but we don't
  // want to force navigation since this is only a prefetch
  doPrefetch().catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      // rethrow to show invalid URL errors
      throw err
    }
  })
}
