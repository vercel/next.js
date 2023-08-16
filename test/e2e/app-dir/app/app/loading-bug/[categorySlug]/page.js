import { use } from 'react'

const fetchCategory = async (categorySlug) => {
  // artificial delay
  await new Promise((resolve) => setTimeout(resolve, 3000))

  return categorySlug + 'abc'
}

export default function Page({ params }) {
  const category = use(fetchCategory(params.categorySlug))

  return <div id="category-id">{category}</div>
}
