import { cookies } from 'next/headers'

export type Cookie = typeof cookies
export function foo(c: typeof cookies) {
  return c
}
