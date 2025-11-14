import type { FlightRouterState } from '../../shared/lib/app-router-types'
import type { AppRouterInstance } from '../../shared/lib/app-router-context.shared-runtime'
import {
  FetchStrategy,
  type PrefetchTaskFetchStrategy,
  PrefetchPriority,
} from './segment-cache/types'
import { createCacheKey } from './segment-cache/cache-key'
import {
  type PrefetchTask,
  schedulePrefetchTask as scheduleSegmentPrefetchTask,
  cancelPrefetchTask,
  reschedulePrefetchTask,
  isPrefetchTaskDirty,
} from './segment-cache/scheduler'
import { startTransition } from 'react'

type LinkElement = HTMLAnchorElement | SVGAElement

type Element = LinkElement | HTMLFormElement

// Properties that are shared between Link and Form instances. We use the same
// shape for both to prevent a polymorphic de-opt in the VM.
type LinkOrFormInstanceShared = {
  router: AppRouterInstance
  fetchStrategy: PrefetchTaskFetchStrategy

  isVisible: boolean

  // The most recently initiated prefetch task. It may or may not have
  // already completed. The same prefetch task object can be reused across
  // multiple prefetches of the same link.
  prefetchTask: PrefetchTask | null
}

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
const observer: IntersectionObserver | null =
  typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(handleIntersect, {
        rootMargin: '200px',
      })
    : null

function observeVisibility(element: Element, instance: PrefetchableInstance) {
  const existingInstance = prefetchable.get(element)
  if (existingInstance !== undefined) {
    // This shouldn't happen because each <Link> component should have its own
    // anchor tag instance, but it's defensive coding to avoid a memory leak in
    // case there's a logical error somewhere else.
    unmountPrefetchableInstance(element)
  }
  // Only track prefetchable links that have a valid prefetch URL
  prefetchable.set(element, instance)
  if (observer !== null) {
    observer.observe(element)
  }
}

function coercePrefetchableUrl(href: string): URL | null {
  if (typeof window !== 'undefined') {
    const { createPrefetchURL } =
      require('./app-router-utils') as typeof import('./app-router-utils')

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
  } else {
    return null
  }
}

export function mountLinkInstance(
  element: LinkElement,
  href: string,
  router: AppRouterInstance,
  fetchStrategy: PrefetchTaskFetchStrategy,
  prefetchEnabled: boolean,
  setOptimisticLinkStatus: (status: { pending: boolean }) => void
): LinkInstance {
  if (prefetchEnabled) {
    const prefetchURL = coercePrefetchableUrl(href)
    if (prefetchURL !== null) {
      const instance: PrefetchableLinkInstance = {
        router,
        fetchStrategy,
        isVisible: false,
        prefetchTask: null,
        prefetchHref: prefetchURL.href,
        setOptimisticLinkStatus,
      }
      // We only observe the link's visibility if it's prefetchable. For
      // example, this excludes links to external URLs.
      observeVisibility(element, instance)
      return instance
    }
  }
  // If the link is not prefetchable, we still create an instance so we can
  // track its optimistic state (i.e. useLinkStatus).
  const instance: NonPrefetchableLinkInstance = {
    router,
    fetchStrategy,
    isVisible: false,
    prefetchTask: null,
    prefetchHref: null,
    setOptimisticLinkStatus,
  }
  return instance
}

export function mountFormInstance(
  element: HTMLFormElement,
  href: string,
  router: AppRouterInstance,
  fetchStrategy: PrefetchTaskFetchStrategy
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
    fetchStrategy,
    isVisible: false,
    prefetchTask: null,
    prefetchHref: prefetchURL.href,
    setOptimisticLinkStatus: null,
  }
  observeVisibility(element, instance)
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

  instance.isVisible = isVisible
  if (isVisible) {
    prefetchableAndVisible.add(instance)
  } else {
    prefetchableAndVisible.delete(instance)
  }
  rescheduleLinkPrefetch(instance, PrefetchPriority.Default)
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
  if (instance !== undefined) {
    if (
      process.env.__NEXT_DYNAMIC_ON_HOVER &&
      unstable_upgradeToDynamicPrefetch
    ) {
      // Switch to a full prefetch
      instance.fetchStrategy = FetchStrategy.Full
    }
    rescheduleLinkPrefetch(instance, PrefetchPriority.Intent)
  }
}

function rescheduleLinkPrefetch(
  instance: PrefetchableInstance,
  priority: PrefetchPriority.Default | PrefetchPriority.Intent
) {
  // Ensures that app-router-instance is not compiled in the server bundle
  if (typeof window !== 'undefined') {
    const existingPrefetchTask = instance.prefetchTask

    if (!instance.isVisible) {
      // Cancel any in-progress prefetch task. (If it already finished then this
      // is a no-op.)
      if (existingPrefetchTask !== null) {
        cancelPrefetchTask(existingPrefetchTask)
      }
      // We don't need to reset the prefetchTask to null upon cancellation; an
      // old task object can be rescheduled with reschedulePrefetchTask. This is a
      // micro-optimization but also makes the code simpler (don't need to
      // worry about whether an old task object is stale).
      return
    }

    const { getCurrentAppRouterState } =
      require('./app-router-instance') as typeof import('./app-router-instance')

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
          instance.fetchStrategy,
          priority,
          null
        )
      } else {
        // We already have an old task object that we can reschedule. This is
        // effectively the same as canceling the old task and creating a new one.
        reschedulePrefetchTask(
          existingPrefetchTask,
          treeAtTimeOfPrefetch,
          instance.fetchStrategy,
          priority
        )
      }
    }
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
  for (const instance of prefetchableAndVisible) {
    const task = instance.prefetchTask
    if (task !== null && !isPrefetchTaskDirty(task, nextUrl, tree)) {
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
    instance.prefetchTask = scheduleSegmentPrefetchTask(
      cacheKey,
      tree,
      instance.fetchStrategy,
      PrefetchPriority.Default,
      null
    )
  }
}
