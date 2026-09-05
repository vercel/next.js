import { unstable_cache } from 'next/cache'
import { dbListProducts, dbGetProduct, dbGetPromo, dbGetUser } from './db'

// Catalog listing: cached for five minutes, tagged for on-demand refresh.
export const getProducts = unstable_cache(dbListProducts, ['products'], {
  tags: ['products'],
  revalidate: 300,
})

export async function getPromo() {
  return dbGetPromo()
}

export async function getProduct(slug: string) {
  return dbGetProduct(slug)
}

export async function getUser(userId: string) {
  return dbGetUser(userId)
}
