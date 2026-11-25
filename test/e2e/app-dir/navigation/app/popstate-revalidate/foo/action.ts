'use server'

import { revalidatePath } from 'next/cache'

export async function action() {
  revalidatePath('/popstate-revalidate', 'layout')
  return true
}
