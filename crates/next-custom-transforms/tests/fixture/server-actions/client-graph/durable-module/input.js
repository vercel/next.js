'use cache: remote'

import { unstable_cacheDurable } from 'next/cache'

// @ts-ignore
import { imported } from './other'
export { imported }

export async function named(value) {
  unstable_cacheDurable()
  return value
}

export const arrow = async (value) => {
  unstable_cacheDurable()
  return value
}

export default async function () {
  unstable_cacheDurable()
  return 'default'
}

export async function ordinary(value) {
  return value
}

export async function nonDurable() {
  'use cache: x'
  return 'not durable'
}

export async function shadowed(unstable_cacheDurable) {
  unstable_cacheDurable()
  return 'not durable'
}
