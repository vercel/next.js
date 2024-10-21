'use client'

import { Suspense, use } from 'react'
import { type UnsafeUnwrappedSearchParams } from 'next/server'

import { IndirectionOne, IndirectionTwo, IndirectionThree } from './indirection'

type SearchParams = { foo: string | string[] | undefined }
export default function Page(props: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <p>
        This page accesses searchParams synchronously and it does it early
        enough that some sibling component trees are not finished and they do
        not have a parent Suspense boundary above them.
      </p>
      <Suspense fallback={<Fallback />}>
        <IndirectionOne>
          <SearchParamsReadingComponent searchParams={props.searchParams} />
        </IndirectionOne>
      </Suspense>
      <IndirectionTwo>
        <LongRunningComponent />
      </IndirectionTwo>
      <IndirectionThree>
        <ShortRunningComponent />
      </IndirectionThree>
    </>
  )
}

function SearchParamsReadingComponent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  if (typeof window === 'undefined') {
    use(new Promise((r) => process.nextTick(r)))
  }
  const fooParams = (
    searchParams as unknown as UnsafeUnwrappedSearchParams<typeof searchParams>
  ).foo
  return (
    <div>
      this component read the accessed the `foo` search param: {fooParams}
    </div>
  )
}

function LongRunningComponent() {
  if (typeof window === 'undefined') {
    use(
      new Promise((r) =>
        process.nextTick(async () => {
          await 1
          process.nextTick(r)
        })
      )
    )
  }
  return (
    <div>
      this component took a long time to resolve (but still before the dynamicIO
      cutoff). It might not be done before the sync searchParams access happens.
    </div>
  )
}

function ShortRunningComponent() {
  return (
    <div>
      This component runs quickly (in a microtask). It should be finished before
      the sync searchParams access happens.
    </div>
  )
}

function Fallback() {
  return <div data-fallback="">loading...</div>
}
