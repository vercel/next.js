import { use } from 'react'
import { fetchCategoryBySlug } from '../getCategories'
import SubCategoryNav from './SubCategoryNav'

export default function Layout({ children, params }) {
  const category = use(fetchCategoryBySlug(params.categorySlug))
  if (!category) return null
  return (
    <>
      <SubCategoryNav category={category} />
      {children}
    </>
  )
}
