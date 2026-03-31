'use server'

import { revalidateTag } from 'next/cache'

export async function revalidateBasicCache() {
  revalidateTag('a1-basic')
}
