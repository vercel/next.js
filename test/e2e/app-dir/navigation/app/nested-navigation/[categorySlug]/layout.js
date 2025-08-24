import { fetchCategoryBySlug } from '../getCategories'
import SubCategoryNav from './SubCategoryNav'

export default async function Layout({ children, params }) {
  const category = await fetchCategoryBySlug((await params).categorySlug)
  if (!category) return null
  return (
    <>
      <SubCategoryNav category={category} />
      {children}
    </>
  )
}
