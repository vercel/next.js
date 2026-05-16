import { use } from 'react'
import { fetchSubCategory } from '../../getCategories'

export default function Page({ params }) {
  const category = use(
    fetchSubCategory(use(params).categorySlug, use(params).subCategorySlug)
  )
  if (!category) return null

  return <h1 id={category.name.toLowerCase()}>{category.name}</h1>
}
