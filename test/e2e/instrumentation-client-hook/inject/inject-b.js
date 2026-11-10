window.__INJECT_ORDER = window.__INJECT_ORDER || []
window.__INJECT_ORDER.push('b')
window.__INJECT_B_EXECUTED_AT = performance.now()

export function onRouterTransitionStart(href, navigateType) {
  const pathname = new URL(href, window.location.href).pathname
  console.log(`[Router Transition Start] [${navigateType}] ${pathname} b`)
}
