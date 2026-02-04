import { cookies } from 'next/headers'

export function myFunc() {
  const c = cookies()
  cookies()
}
