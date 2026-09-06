'use server'

import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { getCachedValue } from './cached-value'

export async function readCachedValue() {
  const value = await getCachedValue()
  revalidatePath('/events/foo/group')
  return value
}

export async function notFoundAfterRevalidation() {
  revalidatePath('/events/foo/group')
  notFound()
}
