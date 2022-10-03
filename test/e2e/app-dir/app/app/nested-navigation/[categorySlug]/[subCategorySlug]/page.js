import { experimental_use as use } from 'react'
import { fetchSubCategory } from '../../getCategories'

export default function Page({ params }) {
  const category = use(
    fetchSubCategory(params.categorySlug, params.subCategorySlug)
  )
  if (!category) return null

  return <h1>{category.name}</h1>
}
