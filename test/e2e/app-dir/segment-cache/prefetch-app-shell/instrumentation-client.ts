type TransitionEvent = {
  id: string
  timestamp: number
  fromRoutes?: string[]
  routes?: string[]
  prefetch?: string
  prefetchIntent?: string
}

function record(phase: string, url: string, event: TransitionEvent) {
  const events = ((window as any).__ROUTER_TRANSITION_EVENTS ??= [])
  events.push({
    phase,
    url: new URL(url, window.location.href).pathname,
    event,
  })
}

export function onRouterTransitionStart(
  url: string,
  _navigationType: string,
  event: TransitionEvent
) {
  record('start', url, event)
}

export function unstable_onRouterTransitionCommit(
  url: string,
  _navigationType: string,
  event: TransitionEvent
) {
  record('commit', url, event)
}

export function unstable_onRouterTransitionSettled(
  url: string,
  _navigationType: string,
  event: TransitionEvent
) {
  record('settled', url, event)
}
