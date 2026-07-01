// The documented fix: a loading boundary makes the dynamic-route navigation commit
// immediately (URL changes + this UI shows) instead of waiting for the full server
// render, closing the long pending window where the soft-nav commit can be dropped.
export default function Loading() {
  return <div data-testid="route-loading">loading route…</div>
}
