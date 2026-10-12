window.__INJECT_ORDER = window.__INJECT_ORDER || []
window.__INJECT_ORDER.push('a')
window.__INJECT_A_EXECUTED_AT = performance.now()

export function onRouterTransitionStart(href, navigateType) {
  const pathname = new URL(href, window.location.href).pathname
  console.log(`[Router Transition Start] [${navigateType}] ${pathname} a`)
  if (window.__THROW_INJECT_A) {
    throw new Error('inject a transition hook failed')
  }
}
