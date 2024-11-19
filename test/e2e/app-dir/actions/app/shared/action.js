'use server'

import { expirePath } from 'next/cache'

let x = 0

export async function inc() {
  ++x
  expirePath('/shared')
}

export async function get() {
  return x
}
