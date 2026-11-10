type Params = { category: string; item: string }

/**
 * Page component that accesses ONLY the `category` param, NOT `item`.
 *
 * This is the key to this test: even though the URL includes both params,
 * this page only accesses `category`. Therefore:
 * - When navigating between /electronics/phone and /electronics/tablet,
 *   this page segment is a cache hit (category unchanged)
 *
 * The layout accesses both params, so it must be re-fetched when `item`
 * changes. This demonstrates that param access tracking is per-segment,
 * allowing fine-grained cache reuse.
 */
export default async function PageReusePage({
  params,
}: {
  params: Promise<Params>
}) {
  // NOTE: Only accessing `category`, NOT `item`
  // This is intentional to demonstrate page reuse when item changes
  const { category } = await params

  return (
    <div id="page-reuse-page">
      <div data-page-category={category}>{`Page category: ${category}`}</div>
    </div>
  )
}
