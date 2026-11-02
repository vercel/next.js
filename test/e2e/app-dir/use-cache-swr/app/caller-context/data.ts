import { cacheLife, cacheTag } from 'next/cache'
import { notify } from '../../lib/notify'

export async function readData(id: string) {
  'use cache'
  cacheLife({ stale: 300, revalidate: 1, expire: 3600 })
  cacheTag(`caller-context:${id}`)

  await notify(`fill:${id}`)
  return { value: `${id}:${crypto.randomUUID()}`, createdAt: Date.now() }
}

export async function readOuter(id: string, name: string) {
  'use cache'
  cacheLife('hours')
  return { name, data: await readData(id) }
}
