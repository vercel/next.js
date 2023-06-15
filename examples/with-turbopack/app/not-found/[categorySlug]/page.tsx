import { getCategory } from '#/app/api/categories/getCategories'
import { SkeletonCard } from '#/ui/skeleton-card'

export default async function Page({
  params,
}: {
  params: { categorySlug: string }
}) {
  // - `getCategory()` returns `notFound()` if the fetched data is `null` or `undefined`.
  // - `notFound()` renders the closest `not-found.tsx` in the route segment hierarchy.
  // - For `layout.js`, the closest `not-found.tsx` starts from the parent segment.
  // - For `page.js`, the closest `not-found.tsx` starts from the same segment.
  // - Learn more: https://beta.nextjs.org/docs/routing/fundamentals#component-hierarchy.
  const category = await getCategory({ slug: params.categorySlug })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium text-gray-400/80">
        All {category.name}
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
