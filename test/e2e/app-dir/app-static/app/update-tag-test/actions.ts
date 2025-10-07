'use server'

import { revalidateTag, updateTag } from 'next/cache'

export async function updateAction() {
  // This should work - updateTag in server action
  updateTag('test-update-tag')

  return { updated: true, timestamp: Date.now() }
}

export async function revalidateAction() {
  // This should work with second argument
  revalidateTag('test-update-tag', 'max')

  return { revalidated: true, timestamp: Date.now() }
}

export async function deprecatedRevalidateAction() {
  // @ts-expect-error This should show deprecation warning
  revalidateTag('test-update-tag')

  return { revalidated: true, timestamp: Date.now() }
}
