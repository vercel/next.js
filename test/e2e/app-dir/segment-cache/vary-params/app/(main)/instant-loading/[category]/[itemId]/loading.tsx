/**
 * Loading boundary for the instant loading test. This component renders
 * while the dynamic page content is loading.
 *
 * When the layout segment is cached (because category matches a previous
 * prefetch), this loading state renders instantly from cache during
 * navigation — no network round-trip required.
 */
export default function Loading() {
  return <div data-loading="true">Loading item...</div>
}
