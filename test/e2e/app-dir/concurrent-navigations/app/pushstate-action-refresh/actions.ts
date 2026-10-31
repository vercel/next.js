'use server'

import { revalidatePath } from 'next/cache'

export async function slowAction(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
  revalidatePath('/pushstate-action-refresh')
  return Date.now()
}
