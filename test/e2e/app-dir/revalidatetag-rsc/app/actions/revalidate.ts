'use server'

import { unstable_expireTag } from 'next/cache'

export const revalidate = async (
  tag: string
): Promise<{ revalidated: boolean }> => {
  unstable_expireTag(tag)

  return { revalidated: true }
}
