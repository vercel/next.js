import { hasEnv } from '../dependencies/existence'

export async function getValue() {
  'use cache: remote, durable'
  return hasEnv()
}
