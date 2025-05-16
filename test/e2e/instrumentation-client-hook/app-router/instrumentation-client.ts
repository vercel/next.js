;(window as any).__INSTRUMENTATION_CLIENT_EXECUTED_AT = performance.now()

const start = performance.now()
while (performance.now() - start < 20) {
  // Intentionally block for 20ms to test instrumentation timing
}

export function onRouterTransitionStart(href: string, navigateType: string) {
  const pathname = new URL(href, window.location.href).pathname
  console.log(`[Router Transition Start] [${navigateType}] ${pathname}`)
}
