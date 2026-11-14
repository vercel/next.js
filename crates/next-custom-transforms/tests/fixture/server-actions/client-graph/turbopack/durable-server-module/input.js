'use server'

import {
  unstable_cacheDurable,
  unstable_cacheDurable as durable,
} from 'next/cache'

export async function named(value) {
  unstable_cacheDurable()
  return value
}

export { named as namedAlias }

export const arrow = async () => durable()

export default async function () {
  unstable_cacheDurable()
  return 'default'
}

export async function ordinary(value) {
  return value
}
