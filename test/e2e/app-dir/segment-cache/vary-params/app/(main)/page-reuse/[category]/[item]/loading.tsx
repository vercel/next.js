/**
 * Loading boundary for the page reuse test.
 *
 * This shows while the page content is loading. In this test, the loading
 * state itself can be cached (it doesn't access any params), so it renders
 * instantly when navigating.
 */
export default function Loading() {
  return <div data-loading="true">Loading page...</div>
}
