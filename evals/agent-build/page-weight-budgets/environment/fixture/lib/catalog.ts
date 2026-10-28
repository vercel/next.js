import catalog from './catalog.json'

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

export const formatPrice = (price: number) => `$${price.toFixed(2)}`
