type Params = { category: string; itemId: string }

/**
 * Page component that renders the itemId param. This segment has NO
 * generateStaticParams, so itemId is fully dynamic and loads behind
 * the Suspense boundary (loading.tsx).
 *
 * When navigating to this page:
 * 1. The parent [category] layout renders instantly from cache (it's static)
 * 2. The loading.tsx shows while this page loads dynamically
 * 3. This page replaces the loading state once the dynamic request completes
 */
export default async function InstantLoadingPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { category, itemId } = await params
  return (
    <div id="instant-loading-page">
      <div data-category={category} data-item-id={itemId}>
        Item: {itemId} (in category: {category})
      </div>
    </div>
  )
}
