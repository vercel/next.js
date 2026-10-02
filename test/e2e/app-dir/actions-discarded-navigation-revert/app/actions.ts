'use server'

import { revalidatePath } from 'next/cache'

export async function echo(value: string) {
  return value
}

export async function reject() {
  throw new Error('intentional test error')
}

export async function revalidate() {
  revalidatePath('/', 'layout')
  return 'revalidated'
}
