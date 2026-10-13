import { notFound } from 'next/navigation'

const categories = ['first', 'second']

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams

  if (category && !categories.includes(category)) {
    notFound()
  }

  return <p id="blog-page">blog page</p>
}
