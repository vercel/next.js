import 'server-only'
import { randomUUID } from 'node:crypto'
import { after } from 'next/server'

export const completedAfter: string[] = []

async function cachedToken(key: string) {
  'use cache'
  return `${key}:${randomUUID()}`
}

export async function RequestCacheProbe() {
  after(async () => {
    completedAfter.push(await cachedToken('after'))
  })
  return await cachedToken('render')
}

export function RejectingAfterProbe() {
  after(async () => {
    throw new Error('L_EXPECTED_AFTER_FAILURE')
  })
  return 'after failure body'
}
