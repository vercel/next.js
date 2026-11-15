import { cacheTag } from 'next/cache'
import { lang } from 'next/root-params'
import { connection } from 'next/server'

async function inner() {
  'use cache'
  const language = await lang()
  cacheTag('nested-inner', `nested-language-${language}`)
  return language
}

async function outerOne() {
  'use cache'
  cacheTag('nested-outer-one')
  return inner()
}

async function outerTwo() {
  'use cache'
  cacheTag('nested-outer-two')
  return inner()
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ prime?: string }>
}) {
  await connection()
  const { prime } = await searchParams
  const first = prime === '1' ? await outerOne() : null
  const second = await outerTwo()

  return (
    <>
      {first === null ? null : <p id="first">{first}</p>}
      <p id="second">{second}</p>
    </>
  )
}
