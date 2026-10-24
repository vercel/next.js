import { notFound } from 'next/navigation'

const KNOWN_CATEGORIES = ['laptops']

export const dynamicParams = false

export function generateStaticParams() {
  return KNOWN_CATEGORIES.map((category) => ({ category }))
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  if (!KNOWN_CATEGORIES.includes(category)) {
    notFound()
  }
  return <p>Category: {category}</p>
}
