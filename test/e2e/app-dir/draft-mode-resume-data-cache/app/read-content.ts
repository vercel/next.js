import { randomUUID } from 'crypto'
import { cacheLife } from 'next/cache'
import { draftMode } from 'next/headers'

export async function readContent(key: string) {
  'use cache'
  cacheLife('hours')
  const { isEnabled } = await draftMode()
  return `${isEnabled ? 'draft' : 'published'}:${key}:${randomUUID()}`
}
