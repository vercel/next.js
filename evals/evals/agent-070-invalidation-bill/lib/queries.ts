import { dbQueryAllProducts, dbQueryProduct, type Product } from './db'

export type { Product }

export async function getProducts(): Promise<Product[]> {
  return dbQueryAllProducts()
}

export async function getProduct(slug: string): Promise<Product | null> {
  return dbQueryProduct(slug)
}
