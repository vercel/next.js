'use server'

import { revalidateTag } from 'next/cache'

export async function slowAction() {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return 'slow action completed'
}

export async function slowActionWithRevalidation() {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  revalidateTag('cached-random')
  return 'slow action with revalidation completed'
}
