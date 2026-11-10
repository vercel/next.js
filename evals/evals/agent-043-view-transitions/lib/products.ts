export type Product = {
  slug: string
  name: string
  description: string
  price: number
  color: string
}

export const products: Product[] = [
  {
    slug: 'classic-sneakers',
    name: 'Classic Sneakers',
    description: 'Timeless design meets everyday comfort.',
    price: 89,
    color: '#4F46E5',
  },
  {
    slug: 'leather-backpack',
    name: 'Leather Backpack',
    description: 'Handcrafted from premium full-grain leather.',
    price: 129,
    color: '#059669',
  },
  {
    slug: 'wireless-headphones',
    name: 'Wireless Headphones',
    description: 'Crystal-clear audio with active noise cancellation.',
    price: 199,
    color: '#DC2626',
  },
  {
    slug: 'cotton-hoodie',
    name: 'Cotton Hoodie',
    description: 'Ultra-soft organic cotton blend for all-day wear.',
    price: 65,
    color: '#D97706',
  },
]

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug)
}
