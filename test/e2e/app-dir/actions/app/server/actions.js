'use server'

import { redirect } from 'next/navigation'

export async function slowInc(value) {
  await new Promise((resolve) => setTimeout(resolve, 10000))
  return value + 1
}

export default async function dec(value) {
  return value - 1
}

export async function redirectAction(formData) {
  'use server'
  redirect(
    '/header?name=' +
      formData.get('name') +
      '&hidden-info=' +
      formData.get('hidden-info')
  )
}
