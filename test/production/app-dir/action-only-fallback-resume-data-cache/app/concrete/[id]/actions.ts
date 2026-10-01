'use server'

import { revalidatePath } from 'next/cache'

export async function revalidateConcretePage() {
  revalidatePath('/concrete/foo')
  return 'concrete action result'
}
