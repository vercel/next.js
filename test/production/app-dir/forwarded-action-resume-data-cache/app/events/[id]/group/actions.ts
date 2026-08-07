'use server'

import { revalidatePath } from 'next/cache'
import { getCachedValue } from './cached-value'

export async function readCachedValue() {
  const value = await getCachedValue()
  revalidatePath('/events/foo/group')
  return value
}
