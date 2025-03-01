import { fetchCategoryBySlug } from '../getCategories'

export default async function Page({ params }) {
  const category = await fetchCategoryBySlug((await params).categorySlug)
  if (!category) return null

  return <h1 id={`all-${category.name.toLowerCase()}`}>All {category.name}</h1>
}
