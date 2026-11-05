'use cache: remote, durable'

// @ts-ignore
import { imported } from './other'
export { imported }

export async function named(value) {
  return value
}

export const arrow = async (value) => value

export default async function () {
  return 'default'
}

export async function nonDurable() {
  'use cache: x'
  return 'not durable'
}
