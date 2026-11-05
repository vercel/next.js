import { readEnv } from '../dependencies/read'

async function inner() {
  'use cache: remote'
  return readEnv()
}

export async function getValue() {
  'use cache: remote, durable'
  return inner()
}
