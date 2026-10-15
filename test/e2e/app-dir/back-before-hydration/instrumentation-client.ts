;(window as any).__routerTransitions = []

export function onRouterTransitionStart(href: string, navigateType: string) {
  ;(window as any).__routerTransitions.push(
    `${navigateType} ${new URL(href, window.location.href).pathname}`
  )
}
