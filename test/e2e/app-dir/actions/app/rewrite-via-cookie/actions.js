import { cookies } from 'next/headers'

export async function logIn() {
  'use server'
  ;(await cookies()).set('isLoggedIn', '1')
}
