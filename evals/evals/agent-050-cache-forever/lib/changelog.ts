import { cacheLife } from 'next/cache'

export async function getChangelog() {
  'use cache'
  // TODO: entries never change once written — this expires way too often.
  cacheLife('days')
  await new Promise((resolve) => setTimeout(resolve, 50))
  return [
    { version: '2.1.0', notes: 'Faster sync engine' },
    { version: '2.0.0', notes: 'New editor' },
  ]
}
