import { warnOnce } from '../../utils/warn-once'

/**
 * Run function with `scroll-behavior: auto` applied to `<html/>`.
 * This css change will be reverted after the function finishes.
 */
export function disableSmoothScrollDuringRouteTransition(
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
  const hasDataAttribute = htmlElement.dataset.scrollBehavior === 'smooth'

  // Since this is a breaking change, this is temporarily flagged
  // and will be false by default.
  // In the next major (v16), this will be automatically enabled
  if (process.env.__NEXT_OPTIMIZE_ROUTER_SCROLL) {
    if (!hasDataAttribute) {
      // No smooth scrolling configured, run directly without style manipulation
      fn()
      return
    }
  } else {
    // Old behavior: always manipulate styles, but warn about upcoming change

    // Warn if smooth scrolling is detected but no data attribute is present
    if (
      process.env.NODE_ENV === 'development' &&
      !hasDataAttribute &&
      getComputedStyle(htmlElement).scrollBehavior === 'smooth'
    ) {
      warnOnce(
        'Detected `scroll-behavior: smooth` on the `<html>` element. In a future version, ' +
          'Next.js will no longer automatically disable smooth scrolling during route transitions. ' +
          'To prepare for this change, add `data-scroll-behavior="smooth"` to your <html> element. ' +
          'Learn more: https://nextjs.org/docs/messages/missing-data-scroll-behavior'
      )
    }
  }

  // Proceed with temporarily disabling smooth scrolling
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
