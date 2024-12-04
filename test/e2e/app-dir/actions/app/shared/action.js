'use server'

import { unstable_expirePath } from 'next/cache'

let x = 0

export async function inc() {
  ++x
  unstable_expirePath('/shared')
}

export async function get() {
  return x
}
