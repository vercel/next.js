import { cookies } from 'next/headers'

export function validator(action) {
  return async function (arg) {
    'use server'
    const auth = (await cookies()).get('edge-auth')
    if (auth?.value !== '1') {
      throw new Error('Unauthorized request')
    }
    return action(arg)
  }
}
