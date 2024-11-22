'use server'

import { expireTag } from 'next/cache'

export const revalidate = async (
  tag: string
): Promise<{ revalidated: boolean }> => {
  expireTag(tag)

  return { revalidated: true }
}
