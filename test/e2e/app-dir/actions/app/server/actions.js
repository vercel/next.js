'use server'

import { redirect } from 'next/navigation'

export async function slowInc(value) {
  await new Promise((resolve) => setTimeout(resolve, 10000))
  return value + 1
}

export const dec = async (value) => {
  return value - 1
}

// Test case for https://github.com/vercel/next.js/issues/54655
export default dec

export async function redirectAction(formData) {
  'use server'
  redirect(
    '/header?name=' +
      formData.get('name') +
      '&hidden-info=' +
      formData.get('hidden-info')
  )
}

// Test case for https://github.com/vercel/next.js/issues/61183
export const dummyServerAction = () => new Promise((r) => setTimeout(r, 2000))
