'use server'

import { revalidatePath } from 'next/cache'

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function fast() {
  await sleep(60)
  return true
}

export async function slow(ms: number) {
  await sleep(ms)
  return true
}

export async function slowReject(ms: number) {
  await sleep(ms)
  throw new Error('intentional test error')
}

export async function slowRevalidate(ms: number) {
  await sleep(ms)
  revalidatePath('/', 'layout')
  return true
}
