'use server'
import { revalidateTag } from 'next/cache'

export async function revalidateWithTag(tag) {
  revalidateTag(tag)
  return 'done'
}
