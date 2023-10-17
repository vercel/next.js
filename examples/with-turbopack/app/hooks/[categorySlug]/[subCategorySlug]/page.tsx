import { getCategory } from '#/app/api/categories/getCategories'
import { HooksClient } from '#/app/hooks/_components/router-context'

export default async function Page({
  params,
}: {
  params: { categorySlug: string; subCategorySlug: string }
}) {
  const category = await getCategory({ slug: params.subCategorySlug })

  return (
    <div className="space-y-9">
      <h1 className="text-xl font-medium text-gray-400/80">{category.name}</h1>

      <HooksClient />
    </div>
  )
}
