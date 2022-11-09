import { use } from 'react'
import { fetchCategories } from './getCategories'
import React from 'react'
import CategoryNav from './CategoryNav'

export default function Layout({ children }) {
  const categories = use(fetchCategories())
  return (
    <div>
      <div>
        <CategoryNav categories={categories} />
      </div>

      <div>{children}</div>
    </div>
  )
}
