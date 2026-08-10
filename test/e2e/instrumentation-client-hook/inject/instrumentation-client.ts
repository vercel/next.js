;(window as any).__INJECT_ORDER = (window as any).__INJECT_ORDER || []
;(window as any).__INJECT_ORDER.push('user')
;(window as any).__INSTRUMENTATION_CLIENT_EXECUTED_AT = performance.now()

export function onRouterTransitionStart(href: string, navigateType: string) {
  const pathname = new URL(href, window.location.href).pathname
  console.log(`[Router Transition Start] [${navigateType}] ${pathname} user`)
}
