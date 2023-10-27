/**
 * Run function with `scroll-behavior: auto` applied to `<html/>`.
 * This css change will be reverted after the function finishes.
 */
export function handleSmoothScroll(
  fn: () => void,
  options: { dontForceLayout?: boolean; onlyHashChange?: boolean } = {}
) {
  // if only the hash is changed, we don't need to disable smooth scrolling
  // we only care to prevent smooth scrolling when navigating to a new page to avoid jarring UX
  if (options.onlyHashChange) {
    fn()
    return
  }
  const htmlElement = document.documentElement
  const existing = htmlElement.style.scrollBehavior
  htmlElement.style.scrollBehavior = 'auto'
  if (!options.dontForceLayout) {
    // In Chrome-based browsers we need to force reflow before calling `scrollTo`.
    // Otherwise it will not pickup the change in scrollBehavior
    // More info here: https://github.com/vercel/next.js/issues/40719#issuecomment-1336248042
    htmlElement.getClientRects()
  }
  fn()
  htmlElement.style.scrollBehavior = existing
}
