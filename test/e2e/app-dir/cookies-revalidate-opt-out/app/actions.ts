'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function setCookie(value: string) {
  const cookieStore = await cookies()
  cookieStore.set('test-cookie', value)
  return value
}

export async function setCookieWithoutRevalidate(value: string) {
  const cookieStore = await cookies()
  cookieStore.set('test-cookie', value, { revalidate: false })
  return value
}

export async function setCookieObjectFormWithoutRevalidate(value: string) {
  const cookieStore = await cookies()
  cookieStore.set({ name: 'test-cookie', value, revalidate: false })
  return value
}

export async function deleteCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.delete('test-cookie')
  return token
}

export async function deleteCookieWithoutRevalidate(token: string) {
  const cookieStore = await cookies()
  cookieStore.delete({ name: 'test-cookie', revalidate: false })
  return token
}

export async function setCookiesMixed(value: string) {
  const cookieStore = await cookies()
  cookieStore.set('test-cookie', value, { revalidate: false })
  cookieStore.set('other-cookie', value)
  return value
}

export async function setCookieWithoutRevalidateAndRevalidatePath(
  value: string
) {
  const cookieStore = await cookies()
  cookieStore.set('test-cookie', value, { revalidate: false })
  revalidatePath('/')
  return value
}
