window.__INJECT_ORDER = window.__INJECT_ORDER || []
window.__INJECT_ORDER.push('late-hook')

const hooks = {}
module.exports = hooks

window.__INSTALL_LATE_INSTRUMENTATION_HOOK = () => {
  hooks.onRouterTransitionStart = (href, navigateType) => {
    const pathname = new URL(href, window.location.href).pathname
    console.log(
      `[Router Transition Start] [${navigateType}] ${pathname} late-hook`
    )
  }
}
