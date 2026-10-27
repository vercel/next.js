'use server'

import { revalidatePath } from 'next/cache'

export async function refreshProduct() {
  revalidatePath('/products/known')
  return 'action completed'
}
