import type { FlightRouterState } from '../../server/app-render/types'
import type { AppRouterInstance } from '../../shared/lib/app-router-context.shared-runtime'
import { getCurrentAppRouterState } from './app-router-instance'
import { createPrefetchURL } from './app-router'
import { PrefetchKind } from './router-reducer/router-reducer-types'
import { getCurrentCacheVersion } from './segment-cache'
import { createCacheKey } from './segment-cache'
import {
  type PrefetchTask,
  PrefetchPriority,
  schedulePrefetchTask as scheduleSegmentPrefetchTask,
  cancelPrefetchTask,
  reschedulePrefetchTask,
} from './segment-cache'
import { startTransition } from 'react'

type LinkElement = HTMLAnchorElement | SVGAElement

type Element = LinkElement | HTMLFormElement

// Properties that are shared between Link and Form instances. We use the same
// shape for both to prevent a polymorphic de-opt in the VM.
type LinkOrFormInstanceShared = {
  router: AppRouterInstance
  kind: PrefetchKind.AUTO | PrefetchKind.FULL

  wasHoveredOrTouched: boolean

  // The most recently initiated prefetch task. It may or may not have
  // already completed.  The same prefetch task object can be reused across
  // multiple prefetches of the same link.
  prefetchTask: PrefetchTask | null

  // The cache version at the time the task was initiated. This is used to
  // determine if the cache was invalidated since the task was initiated.
  cacheVersion: number
}

type PrefetchStrategy = 'viewport' | 'predict' | 'intent'

export type FormInstance = LinkOrFormInstanceShared & {
  prefetchHref: string
  setOptimisticLinkStatus: null
}

type PrefetchableLinkInstance = LinkOrFormInstanceShared & {
  prefetchHref: string
  setOptimisticLinkStatus: (status: { pending: boolean }) => void
}

type NonPrefetchableLinkInstance = LinkOrFormInstanceShared & {
  prefetchHref: null
  setOptimisticLinkStatus: (status: { pending: boolean }) => void
}

type PrefetchableInstance = PrefetchableLinkInstance | FormInstance

export type LinkInstance =
  | PrefetchableLinkInstance
  | NonPrefetchableLinkInstance

// Tracks the most recently navigated link instance. When null, indicates
// the current navigation was not initiated by a link click.
let linkForMostRecentNavigation: LinkInstance | null = null

// Status object indicating link is pending
export const PENDING_LINK_STATUS = { pending: true }

// Status object indicating link is idle
export const IDLE_LINK_STATUS = { pending: false }

// Updates the loading state when navigating between links
// - Resets the previous link's loading state
// - Sets the new link's loading state
// - Updates tracking of current navigation
export function setLinkForCurrentNavigation(link: LinkInstance | null) {
  startTransition(() => {
    linkForMostRecentNavigation?.setOptimisticLinkStatus(IDLE_LINK_STATUS)
    link?.setOptimisticLinkStatus(PENDING_LINK_STATUS)
    linkForMostRecentNavigation = link
  })
}

// Unmounts the current link instance from navigation tracking
export function unmountLinkForCurrentNavigation(link: LinkInstance) {
  if (linkForMostRecentNavigation === link) {
    linkForMostRecentNavigation = null
  }
}

// Use a WeakMap to associate a Link instance with its DOM element. This is
// used by the IntersectionObserver to track the link's visibility.
const prefetchable:
  | WeakMap<Element, PrefetchableInstance>
  | Map<Element, PrefetchableInstance> =
  typeof WeakMap === 'function' ? new WeakMap() : new Map()

// A Set of the currently visible links. We re-prefetch visible links after a
// cache invalidation, or when the current URL changes. It's a separate data
// structure from the WeakMap above because only the visible links need to
// be enumerated.
const prefetchableAndVisible: Set<PrefetchableInstance> = new Set()

// A single IntersectionObserver instance shared by all <Link> components.
let observer: IntersectionObserver | null = null
function detectPrefetch(
  element: Element,
  instance: PrefetchableInstance,
  strategy: PrefetchStrategy
) {
  const existingInstance = prefetchable.get(element)
  if (existingInstance !== undefined) {
    // This shouldn't happen because each <Link> component should have its own
    // anchor tag instance, but it's defensive coding to avoid a memory leak in
    // case there's a logical error somewhere else.
    unmountPrefetchableInstance(element)
  }
  // Only track prefetchable links that have a valid prefetch URL
  prefetchable.set(element, instance)

  if (strategy === 'viewport') {
    observer ??= new IntersectionObserver(handleIntersect, {
      rootMargin: '200px',
    })

    observer.observe(element)
  }
}

function coercePrefetchableUrl(href: string): URL | null {
  try {
    return createPrefetchURL(href)
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
    return null
  }
}

export function mountLinkInstance(
  element: LinkElement,
  href: string,
  router: AppRouterInstance,
  kind: PrefetchKind.AUTO | PrefetchKind.FULL,
  strategy: PrefetchStrategy | false,
  setOptimisticLinkStatus: (status: { pending: boolean }) => void
): LinkInstance {
  const prefetchURL = strategy ? coercePrefetchableUrl(href) : null
  const instance: PrefetchableLinkInstance | NonPrefetchableLinkInstance = {
    router,
    kind,
    wasHoveredOrTouched: false,
    prefetchTask: null,
    cacheVersion: -1,
    prefetchHref: prefetchURL?.href ?? null,
    setOptimisticLinkStatus,
  }

  if (instance.prefetchHref !== null && strategy) {
    // We only detect the link if it's prefetchable. For
    // example, this excludes links to external URLs.
    detectPrefetch(element, instance, strategy)

    return instance
  }

  // If the link is not prefetchable, we still create an instance so we can
  // track its optimistic state (i.e. useLinkStatus).
  return instance
}

export function mountFormInstance(
  element: HTMLFormElement,
  href: string,
  router: AppRouterInstance,
  kind: PrefetchKind.AUTO | PrefetchKind.FULL
): void {
  const prefetchURL = coercePrefetchableUrl(href)
  if (prefetchURL === null) {
    // This href is not prefetchable, so we don't track it.
    // TODO: We currently observe/unobserve a form every time its href changes.
    // For Links, this isn't a big deal because the href doesn't usually change,
    // but for forms it's extremely common. We should optimize this.
    return
  }
  const instance: FormInstance = {
    router,
    kind,
    wasHoveredOrTouched: false,
    prefetchTask: null,
    cacheVersion: -1,
    prefetchHref: prefetchURL.href,
    setOptimisticLinkStatus: null,
  }
  detectPrefetch(element, instance, 'viewport')
}

export function unmountPrefetchableInstance(element: Element) {
  const instance = prefetchable.get(element)
  if (instance !== undefined) {
    prefetchable.delete(element)
    prefetchableAndVisible.delete(instance)
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

export function onLinkVisibilityChanged(element: Element, isVisible: boolean) {
  if (process.env.NODE_ENV !== 'production') {
    // Prefetching on viewport is disabled in development for performance
    // reasons, because it requires compiling the target page.
    // TODO: Investigate re-enabling this.
    return
  }

  const instance = prefetchable.get(element)
  if (instance === undefined) {
    return
  }

  if (isVisible) {
    prefetchableAndVisible.add(instance)
    rescheduleLinkPrefetch(instance)
  } else {
    prefetchableAndVisible.delete(instance)

    // Cancel any in-progress prefetch task. (If it already finished then this
    // is a no-op.)
    if (instance.prefetchTask !== null) {
      cancelPrefetchTask(instance.prefetchTask)
      // We don't need to reset the prefetchTask to null upon cancellation; an
      // old task object can be rescheduled with reschedulePrefetchTask. This is a
      // micro-optimization but also makes the code simpler (don't need to
      // worry about whether an old task object is stale).
    }
  }
}

export function onNavigationIntent(
  element: HTMLAnchorElement | SVGAElement,
  unstable_upgradeToDynamicPrefetch: boolean
) {
  const instance = prefetchable.get(element)
  if (instance === undefined) {
    return
  }
  // Prefetch the link on hover/touchstart.
  instance.wasHoveredOrTouched = true
  if (
    process.env.__NEXT_DYNAMIC_ON_HOVER &&
    unstable_upgradeToDynamicPrefetch
  ) {
    // Switch to a full, dynamic prefetch
    instance.kind = PrefetchKind.FULL
  }
  rescheduleLinkPrefetch(instance)
}

function rescheduleLinkPrefetch(instance: PrefetchableInstance) {
  const existingPrefetchTask = instance.prefetchTask

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
  const appRouterState = getCurrentAppRouterState()
  if (appRouterState !== null) {
    const treeAtTimeOfPrefetch = appRouterState.tree
    if (existingPrefetchTask === null) {
      // Initiate a prefetch task.
      const nextUrl = appRouterState.nextUrl
      const cacheKey = createCacheKey(instance.prefetchHref, nextUrl)
      instance.prefetchTask = scheduleSegmentPrefetchTask(
        cacheKey,
        treeAtTimeOfPrefetch,
        instance.kind === PrefetchKind.FULL,
        priority
      )
    } else {
      // We already have an old task object that we can reschedule. This is
      // effectively the same as canceling the old task and creating a new one.
      reschedulePrefetchTask(
        existingPrefetchTask,
        treeAtTimeOfPrefetch,
        instance.kind === PrefetchKind.FULL,
        priority
      )
    }

    // Keep track of the cache version at the time the prefetch was requested.
    // This is used to check if the prefetch is stale.
    instance.cacheVersion = getCurrentCacheVersion()
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
  for (const instance of prefetchableAndVisible) {
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

function prefetchWithOldCacheImplementation(instance: PrefetchableInstance) {
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
