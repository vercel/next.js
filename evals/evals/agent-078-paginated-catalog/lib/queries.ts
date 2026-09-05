import { dbQueryCatalogPage, type Product } from './db'

// All catalog reads go through here on their way to the vendor client.
export async function getCatalogPage(page: number): Promise<Product[]> {
  return dbQueryCatalogPage(page)
}
