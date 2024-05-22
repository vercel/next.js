'use server'

import { revalidateTag } from 'next/cache'

export async function revalidateTestTag() {
  revalidateTag('test')
  await Promise.resolve()
}
