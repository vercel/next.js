'use server'

import { updateTag } from 'next/cache'

export async function slowAction() {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return 'slow action completed'
}

export async function slowActionWithRevalidation() {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  updateTag('cached-random')
  return 'slow action with revalidation completed'
}
