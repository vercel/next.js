import { testApiInPromisePassedToAfter } from '../common'
import { Suspense } from 'react'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ apiName?: string; requestId: string }>
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
  searchParams: Promise<{ apiName?: string; requestId: string }>
}) {
  const { apiName, requestId } = await searchParams
  testApiInPromisePassedToAfter('render', apiName!, requestId)
  return null
}
