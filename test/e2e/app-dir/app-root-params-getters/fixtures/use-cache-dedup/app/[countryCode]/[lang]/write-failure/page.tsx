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
  await writeFailureState.pendingFill
  return `${language}:${crypto.randomUUID()}`
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ countryCode: string; lang: string }>
  searchParams: Promise<{ id?: string | string[] }>
}) {
  await connection()
  const { id } = await searchParams
  if (id === undefined) {
    return null
  }
  if (typeof id !== 'string') {
    throw new Error('Expected a single id search parameter')
  }
  const { lang: language } = await params
  writeFailureState.requestedLanguages.push(language)
  return <p id="value">{await readCachedValue(id)}</p>
}
