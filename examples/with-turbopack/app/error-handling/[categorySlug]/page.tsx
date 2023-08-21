import { getCategory } from '#/app/api/categories/getCategories'
import BuggyButton from '#/ui/buggy-button'
import { SkeletonCard } from '#/ui/skeleton-card'

export default async function Page({
  params,
}: {
  params: { categorySlug: string }
}) {
  const category = await getCategory({ slug: params.categorySlug })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium text-gray-400/80">
        All {category.name}
      </h1>

      <BuggyButton />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
