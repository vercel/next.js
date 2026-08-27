'use server'

import { revalidateTag } from 'next/cache'

export async function priceUpdated() {
  revalidateTag('products')
}
