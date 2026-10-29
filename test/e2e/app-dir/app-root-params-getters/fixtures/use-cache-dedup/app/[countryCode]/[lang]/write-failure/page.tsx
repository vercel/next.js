import { cacheLife, cacheTag } from 'next/cache'
import { lang } from 'next/root-params'
import { connection } from 'next/server'
import writeFailureState from '../../../../write-failure-state'

async function readCachedValue(id: string) {
  'use cache'
  cacheLife('hours')
  const language = await lang()
  cacheTag(`write-failure:${id}`, `write-failure-language:${language}`)
  writeFailureState.generatedLanguages.push(language)
  cacheTag(
    `app-root-params-getters:write-generation:${writeFailureState.generatedLanguages.length}`
  )
  if (id.startsWith('lookup-history-')) {
    cacheLife({ stale: 300, revalidate: 0, expire: 3600 })
  }
  await writeFailureState.pendingFill
  return `${language}:${crypto.randomUUID()}`
}

async function readOuterValue(id: string, _name: string) {
  'use cache'
  cacheLife('hours')
  return readCachedValue(id)
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ countryCode: string; lang: string }>
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
  const { lang: language } = await params
  writeFailureState.requestedLanguages.push(language)
  return (
    <p id="value">
      {outer === undefined
        ? await readCachedValue(id)
        : await readOuterValue(id, 'outer')}
    </p>
  )
}
