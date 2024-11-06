'use client'

import { Suspense, use } from 'react'

import type { UnsafeUnwrappedSearchParams } from 'next/server'

import { getSentinelValue } from '../../../../getSentinelValue'

import { createWaiter } from '../../../../client-utils'
const waiter = createWaiter()

type AnySearchParams = { [key: string]: string | string[] | undefined }

export default function Page({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  use(waiter.wait())
  waiter.cleanup()
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
  const copied = { ...searchParams }
  return (
    <>
      <div>
        <p>This component clones search params and then prints</p>
        <ul>
          {Object.keys(copied).map((k) => {
            return (
              <li key={k}>
                {k}:{' '}
                <span data-value={true} id={'value-' + k}>
                  {copied[k]}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      <span id="page">{getSentinelValue()}</span>
    </>
  )
}

function ComponentTwo() {
  return null
}
