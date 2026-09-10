import { unstable_cache } from 'next/cache'

export type Product = {
  slug: string
  name: string
  description: string
}

const products: Product[] = [
  {
    slug: 'field-notes',
    name: 'Field Notes',
    description: 'Weatherproof notes for long days outside.',
  },
  {
    slug: 'trail-light',
    name: 'Trail Light',
    description: 'A compact light with a warm reading mode.',
  },
]

export const getProducts = unstable_cache(
  async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    return products
  },
  ['products'],
  { revalidate: 86400 }
)

export async function getProduct(slug: string) {
  await new Promise((resolve) => setTimeout(resolve, 100))
  return products.find((product) => product.slug === slug) ?? null
}
