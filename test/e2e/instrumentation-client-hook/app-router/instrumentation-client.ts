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
  if ((window as any).__THROW_ON_START) {
    // Opt-in failure mode for tests: the start hook runs synchronously
    // inside the dispatch call stack, so a throw here must not break the
    // navigation being dispatched.
    throw new Error('Intentional start hook failure (test-only)')
  }
  const pathname = new URL(href, window.location.href).pathname
  console.log(`[Router Transition Start] [${navigateType}] ${pathname}`)
  record('start', href, navigateType, event)
}

export function unstable_onRouterTransitionCommit(
  href: string,
  navigateType: string,
  event: unknown
) {
  if ((window as any).__THROW_ON_COMMIT) {
    // Opt-in failure mode for tests: a consumer hook that throws must not
    // break the navigation or suppress the other lifecycle events.
    throw new Error('Intentional commit hook failure (test-only)')
  }
  const pathname = new URL(href, window.location.href).pathname
  console.log(`[Router Transition Commit] [${navigateType}] ${pathname}`)
  record('commit', href, navigateType, event)
}

export function unstable_onRouterTransitionEnd(
  href: string,
  navigateType: string,
  event: unknown
) {
  const pathname = new URL(href, window.location.href).pathname
  console.log(`[Router Transition End] [${navigateType}] ${pathname}`)
  record('end', href, navigateType, event)
}

export function unstable_onRouterTransitionAbort(
  href: string,
  navigateType: string,
  event: unknown
) {
  const pathname = new URL(href, window.location.href).pathname
  console.log(`[Router Transition Abort] [${navigateType}] ${pathname}`)
  record('abort', href, navigateType, event)
}
