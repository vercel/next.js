import { testApiInPromisePassedToAfter } from '../common'
import { Suspense } from 'react'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ apiName?: string }>
}) {
  return (
    <main>
      <Suspense>
        <TestApiInAfter searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function TestApiInAfter({
  searchParams,
}: {
  searchParams: Promise<{ apiName?: string }>
}) {
  const { apiName } = await searchParams
  testApiInPromisePassedToAfter('render', apiName!)
  return null
}
