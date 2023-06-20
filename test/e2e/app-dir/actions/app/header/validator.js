import { cookies } from 'next/headers'

export function validator(action) {
  return async function (arg) {
    'use server'
    const auth = cookies().get('auth')
    if (auth?.value !== '1') {
      throw new Error('Unauthorized request')
    }
    return action(arg)
  }
}
