'use client'

import Link from 'next/link'
import { useSuspenseQuery } from '@tanstack/react-query'
import { productQuery } from './product-query'

export function ProductView({ id }: { id: string }) {
  const { data: product } = useSuspenseQuery(productQuery(id))

  return (
    <main>
      <Link href="/">Back to products</Link>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
    </main>
  )
}
