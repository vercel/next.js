import { queryOptions } from '@tanstack/react-query'
import type { Product } from '@/lib/products'

export const productQuery = (id: string) =>
  queryOptions({
    queryKey: ['product', id] as const,
    queryFn: async (): Promise<Product> => {
      const response = await fetch(`/api/products/${id}`)
      if (!response.ok) throw new Error('Failed to load product')
      return response.json()
    },
  })
