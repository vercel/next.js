'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const ACCESS_COOKIE = 'access'
const PROTECTED_PATH = '/redirect-revalidation/protected'

export async function grantAccessAction(): Promise<never> {
  ;(await cookies()).set(ACCESS_COOKIE, 'granted')
  revalidatePath(PROTECTED_PATH)
  redirect(PROTECTED_PATH)
}

export async function revokeAccessAction(): Promise<void> {
  ;(await cookies()).delete(ACCESS_COOKIE)
  revalidatePath(PROTECTED_PATH)
}

export async function getAccessState(): Promise<string> {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? ''
}
