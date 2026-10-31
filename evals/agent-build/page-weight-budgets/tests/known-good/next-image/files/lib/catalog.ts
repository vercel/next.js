import catalog from './catalog.json'

export { formatPrice } from './format'

export type Review = {
  id: string
  author: string
  rating: number
  date: string
  title: string
  body: string
}
export type Product = {
  slug: string
  name: string
  category: string
  price: number
  rating: number
  image: string
  gallery: string[]
  summary: string
  description: string
  specs: Record<string, string>
  featured: boolean
  reviews: Review[]
}

// The fields a product card needs; pass this to client components instead of the full product.
export type CardProduct = Pick<
  Product,
  'slug' | 'name' | 'category' | 'price' | 'rating' | 'image'
>

export const products = catalog as Product[]
export const categories = [...new Set(products.map((p) => p.category))]

export function getProduct(slug: string) {
  return products.find((p) => p.slug === slug)
}

export function related(product: Product) {
  return products
    .filter((p) => p.category === product.category && p.slug !== product.slug)
    .slice(0, 4)
}

export function toCard({
  slug,
  name,
  category,
  price,
  rating,
  image,
}: Product): CardProduct {
  return { slug, name, category, price, rating, image }
}
