/**
 * This function allows you to indicate that the subsequent code should be
 * deferred to the actual navigation instead of rendering during a runtime
 * prefetch. Runtime prefetches are rendered per-user, per-link, so deferring
 * content below `await unstable_navigation()` saves that per-request
 * rendering cost.
 *
 * It has no effect during static prerendering — static output is computed
 * once and shared across many clients, so there's no per-request cost to
 * save — and no effect on the initial load of a page.
 *
 * Unlike `connection()`, it does not mark the subtree as request-dependent —
 * content below `await unstable_navigation()` remains fully cacheable.
 */
export function unstable_navigation(): Promise<void> {
  throw new Error('unstable_navigation() is not implemented yet.')
}
