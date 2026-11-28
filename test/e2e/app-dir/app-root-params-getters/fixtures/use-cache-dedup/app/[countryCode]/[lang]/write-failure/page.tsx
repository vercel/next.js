import { cacheLife, cacheTag } from 'next/cache'
import { lang } from 'next/root-params'
import { connection } from 'next/server'
import cacheControl from '../../../../cache-control'

async function readCachedValue(id: string, _cacheName: string) {
  'use cache'
  const life = cacheControl.options?.cacheLife
  if (life === undefined) {
    cacheLife('hours')
  } else {
    cacheLife(life)
  }
  const language = await lang()
  cacheTag(`app-root-params-getters:write-language:${language}`)
  return cacheControl.run({ type: 'generate', language }, () => {
    return `${language}:${crypto.randomUUID()}`
  })
}

async function readOuterValue(id: string, _cacheName: string) {
  'use cache'
  cacheLife('hours')
  return readCachedValue(id, 'inner')
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[]; outer?: string }>
}) {
  await connection()
  const { id, outer } = await searchParams
  if (id === undefined) {
    return null
  }
  if (typeof id !== 'string') {
    throw new Error('Expected a single id search parameter')
  }
  return (
    <p id="value">
      {outer === undefined
        ? await readCachedValue(id, 'inner')
        : await readOuterValue(id, 'outer')}
    </p>
  )
}
