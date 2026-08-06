'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export const action = async () => {
  console.log('revalidating')
  revalidatePath('/delayed-action', 'page')
  return Math.random()
}

export const redirectAction = async () => {
  // sleep for 500ms
  await new Promise((res) => setTimeout(res, 500))
  redirect('/delayed-action/node')
}
