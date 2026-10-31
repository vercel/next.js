// Shared module imported by multiple routes so the static-routes-info tool
// can observe deliberate chunk sharing in its `sharedAvg` metric. The string
// is large enough that, however the bundler decides to chunk it (a separate
// shared chunk, or inlined into each importer), the resulting bundle output
// includes it and any shared chunk picked by the bundler is detectable.
export const SHARED_PAYLOAD = 'shared-route-info-payload-' + 'x'.repeat(4096)

export function sharedHelper(): number {
  return SHARED_PAYLOAD.length
}
