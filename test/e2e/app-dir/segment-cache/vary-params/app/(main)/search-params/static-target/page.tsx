/**
 * Page that does NOT access searchParams.
 *
 * This page renders static content without awaiting searchParams.
 * Since '?' is NOT included in varyParams, different search param values
 * WILL share cached prefetch data.
 *
 * Expected behavior:
 * - Prefetching /static-target?foo=1 fetches the segment
 * - Prefetching /static-target?foo=2 is a cache HIT (reuses first prefetch)
 */
export default async function StaticTargetPage() {
  return (
    <div id="static-target-page">
      <div data-static-target-content="true">
        {`Static target content - no searchParams access`}
      </div>
    </div>
  )
}
