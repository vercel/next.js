import { cookies } from 'next/headers'

export type Cookie = Awaited<typeof cookies>;
export function foo(c: Awaited<typeof cookies>) {
  return c
}

