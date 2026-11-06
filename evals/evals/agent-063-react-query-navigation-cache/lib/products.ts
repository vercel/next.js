import { notFound } from 'next/navigation'

export type Product = {
  id: string
  name: string
  price: number
}

const products: Record<string, Product> = {
  '1': { id: '1', name: 'Espresso Machine', price: 499 },
  '2': { id: '2', name: 'Coffee Grinder', price: 129 },
}

export async function getProduct(id: string): Promise<Product> {
  await Promise.resolve()

  const product = products[id]
  if (!product) notFound()
  return product
}
