'use server'
import { expirePath } from 'next/cache'
import { redirect } from 'next/navigation'

export const action = async () => {
  console.log('revalidating')
  expirePath('/delayed-action', 'page')
  return Math.random()
}

export const redirectAction = async () => {
  // sleep for 500ms
  await new Promise((res) => setTimeout(res, 500))
  redirect('/delayed-action/node')
}
