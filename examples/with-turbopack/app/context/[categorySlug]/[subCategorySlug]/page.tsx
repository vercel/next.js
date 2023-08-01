import { getCategory } from '#/app/api/categories/getCategories'
import { Boundary } from '#/ui/boundary'
import { Counter } from '../../context-click-counter'

export default async function Page({
  params,
}: {
  params: { categorySlug: string; subCategorySlug: string }
}) {
  const category = await getCategory({ slug: params.subCategorySlug })

  return (
    <Boundary labels={['Page [Server Component]']} animateRerendering={false}>
      <div className="space-y-8">
        <h1 className="text-xl font-medium text-gray-400/80">
          {category.name}
        </h1>

        <Counter />
      </div>
    </Boundary>
  )
}
