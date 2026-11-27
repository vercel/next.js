'use server'

import { revalidateTag, updateTag } from 'next/cache'

export async function invalidate(_previous: string, formData: FormData) {
  const tag = String(formData.get('tag'))
  const mode = String(formData.get('mode'))
  if (mode === 'update') {
    updateTag(tag)
  } else {
    revalidateTag(tag, 'max')
  }
  return `${mode}:${tag}`
}
