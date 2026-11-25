;(window as any).__INSTRUMENTATION_CLIENT_EXECUTED_AT = performance.now()
;(window as any).__ROUTER_TRANSITION_EVENTS = []

const start = performance.now()
while (performance.now() - start < 20) {
  // Intentionally block for 20ms to test instrumentation timing
}

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
  const pathname = new URL(href, window.location.href).pathname
  console.log(`[Router Transition Start] [${navigateType}] ${pathname}`)
  record('start', href, navigateType, event)
}
