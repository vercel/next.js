type Params = { category: string; item: string }

/**
 * Layout for the [category]/[item] segment. This layout:
 * - Accesses BOTH 'category' AND 'item' → must be re-fetched when either changes
 *
 * This is the inverse of the typical pattern. Usually the layout accesses fewer
 * params than the page, enabling layout reuse. Here, the layout accesses MORE
 * params than the page, which means:
 * - When `item` changes, the layout must be re-fetched
 * - But the page (which only accesses `category`) can be reused
 *
 * This tests that param access is tracked at the segment level, not just at
 * the route level.
 */
export async function generateStaticParams(): Promise<Params[]> {
  return [
    { category: 'electronics', item: 'phone' },
    { category: 'electronics', item: 'tablet' },
  ]
}

export default async function PageReuseLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<Params>
}) {
  const { category, item } = await params

  return (
    <div data-page-reuse-layout="true">
      <div data-layout-info={`${category}/${item}`}>
        {`Layout: ${category}/${item}`}
      </div>
      {children}
    </div>
  )
}
