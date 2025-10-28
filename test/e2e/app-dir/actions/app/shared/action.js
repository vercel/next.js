'use server'

import { revalidatePath } from 'next/cache'

let x = 0

export async function inc() {
  ++x
  revalidatePath('/shared')
}

export async function get() {
  return x
}
