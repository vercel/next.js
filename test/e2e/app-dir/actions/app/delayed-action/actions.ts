'use server'
import { revalidatePath } from 'next/cache'

export const action = async () => {
  console.log('revalidating')
  revalidatePath('/delayed-action', 'page')
  return Math.random()
}
