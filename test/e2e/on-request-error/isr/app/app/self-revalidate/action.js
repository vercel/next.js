'use server'

import { revalidatePath } from 'next/cache'

export async function revalidateSelf() {
  revalidatePath('/app/self-revalidate')
}
