import { notFound } from 'next/navigation'

const KNOWN_CATEGORIES = ['laptops']
const KNOWN_SLUGS = ['macbook-pro']

export const dynamicParams = true

export async function generateStaticParams() {
  const params: { category: string; slug: string }[] = []
  for (const category of KNOWN_CATEGORIES) {
    for (const slug of KNOWN_SLUGS) {
      params.push({ category, slug })
    }
  }
  return params
}

export default async function CategorySlugPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>
}) {
  const { category, slug } = await params
  if (!KNOWN_CATEGORIES.includes(category) || !KNOWN_SLUGS.includes(slug)) {
    notFound()
  }
  return (
    <p>
      Category: {category}, Slug: {slug}
    </p>
  )
}
