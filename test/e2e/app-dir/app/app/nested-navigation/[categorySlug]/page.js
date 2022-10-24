import { use } from 'react'
import { fetchCategoryBySlug } from '../getCategories'

export default function Page({ params }) {
  const category = use(fetchCategoryBySlug(params.categorySlug))
  if (!category) return null

  return <h1 id={`all-${category.name.toLowerCase()}`}>All {category.name}</h1>
}
