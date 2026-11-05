import { readEnv } from '../dependencies/read'

export async function getValue() {
  'use cache: remote, durable'
  return readEnv()
}
