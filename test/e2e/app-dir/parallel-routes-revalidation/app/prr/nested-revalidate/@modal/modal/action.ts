'use server'

import { revalidatePath } from 'next/cache'

export async function revalidateAction() {
  console.log('revalidate action')
  revalidatePath('/prr/nested-revalidate')
  return {
    success: true,
  }
}
