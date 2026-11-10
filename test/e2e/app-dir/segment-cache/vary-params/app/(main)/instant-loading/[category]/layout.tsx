type Params = { category: string }

/**
 * Layout for the [category] segment. This layout:
 * - Accesses only 'category' param → cached across different itemIds
 * - Has generateStaticParams for 'electronics' → this segment is static
 *
 * The child [itemId] segment is dynamic (no generateStaticParams), so when
 * navigating to different itemIds within the same category, this layout
 * renders instantly from cache while the page loads dynamically.
 */
export async function generateStaticParams(): Promise<Params[]> {
  return [{ category: 'electronics' }]
}

export default async function InstantLoadingCategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<Params>
}) {
  const { category } = await params

  return (
    <div data-instant-loading-layout="true">
      <div data-layout-category={category}>{`Category: ${category}`}</div>
      {children}
    </div>
  )
}
