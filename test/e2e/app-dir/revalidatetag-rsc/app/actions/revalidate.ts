'use server'

import { updateTag } from 'next/cache'

export const revalidate = async (
  tag: string
): Promise<{ revalidated: boolean }> => {
  updateTag(tag)

  return { revalidated: true }
}
