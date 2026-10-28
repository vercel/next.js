import type { Product } from '@/lib/catalog'

/** The fields a product card needs; everything else stays on the server. */
export type ProductSummary = Pick<
  Product,
  'slug' | 'name' | 'category' | 'price' | 'rating' | 'image'
>

export const summarize = ({
  slug,
  name,
  category,
  price,
  rating,
  image,
}: Product): ProductSummary => ({
  slug,
  name,
  category,
  price,
  rating,
  image,
})
