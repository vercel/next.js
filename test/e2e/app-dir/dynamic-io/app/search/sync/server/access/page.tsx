import { Suspense } from 'react'

import type { UnsafeUnwrappedSearchParams } from 'next/server'

import { getSentinelValue } from '../../../../getSentinelValue'

type AnySearchParams = { [key: string]: string | string[] | undefined }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  await new Promise((r) => process.nextTick(r))
  const castedSearchParams =
    searchParams as unknown as UnsafeUnwrappedSearchParams<typeof searchParams>
  return (
    <>
      <p>This page access a search param synchronously</p>
      <p>The `use` is inside a Suspense boundary</p>
      <p>With PPR we expect the page to have a partially static page</p>
      <p>Without PPR we expect the page to be dynamic</p>
      <Suspense fallback="outer loading...">
        <Suspense fallback="inner loading...">
          <Component searchParams={castedSearchParams} />
        </Suspense>
        <ComponentTwo />
      </Suspense>
    </>
  )
}

function Component({ searchParams }: { searchParams: AnySearchParams }) {
  return (
    <>
      <div>
        This component accessed `searchParams.sentinel`: "
        <span id="value">{searchParams.sentinel}</span>"
      </div>
      <span id="page">{getSentinelValue()}</span>
    </>
  )
}

function ComponentTwo() {
  return null
}
