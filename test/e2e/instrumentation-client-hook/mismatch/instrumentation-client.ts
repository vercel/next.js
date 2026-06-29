;(window as any).__ROUTER_TRANSITION_EVENTS = []

function record(
  phase: string,
  href: string,
  navigateType: string,
  event: unknown
) {
  ;(window as any).__ROUTER_TRANSITION_EVENTS.push({
    phase,
    url: new URL(href, window.location.href).pathname,
    navigateType,
    event,
  })
}

export function onRouterTransitionStart(
  href: string,
  navigateType: string,
  event: unknown
) {
  record('start', href, navigateType, event)
}

export function unstable_onRouterTransitionCommit(
  href: string,
  navigateType: string,
  event: unknown
) {
  record('commit', href, navigateType, event)
}

export function unstable_onRouterTransitionSettled(
  href: string,
  navigateType: string,
  event: unknown
) {
  record('settled', href, navigateType, event)
}

export function unstable_onRouterTransitionRouteMismatch(
  href: string,
  navigateType: string,
  event: unknown
) {
  record('route-mismatch', href, navigateType, event)
}

export function unstable_onRouterTransitionAbort(
  href: string,
  navigateType: string,
  event: unknown
) {
  record('abort', href, navigateType, event)
}
