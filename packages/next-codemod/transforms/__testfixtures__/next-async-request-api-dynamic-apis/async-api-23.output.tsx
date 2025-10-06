import { cookies } from 'next/headers'

export type Cookie = Awaited<ReturnType<typeof cookies>>
export function foo(c: Awaited<ReturnType<typeof cookies>>) {
  return c
}

