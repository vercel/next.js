import { Suspense } from 'react'
import { type UnsafeUnwrappedSearchParams } from 'next/server'

import { IndirectionOne, IndirectionTwo, IndirectionThree } from './indirection'

type SearchParams = { foo: string | string[] | undefined }
export default async function Page(props: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <>
      <p>
        This page accesses searchParams synchronously but it does so late enough
        in the render that all unfinished sub-trees have a defined Suspense
        boundary. This is fine and doesn't need to error the build.
      </p>
      <Suspense fallback={<Fallback />}>
        <IndirectionOne>
          <SearchParamsReadingComponent searchParams={props.searchParams} />
        </IndirectionOne>
      </Suspense>
      <Suspense fallback={<Fallback />}>
        <IndirectionTwo>
          <LongRunningComponent />
        </IndirectionTwo>
      </Suspense>
      <IndirectionThree>
        <ShortRunningComponent />
      </IndirectionThree>
    </>
  )
}

async function SearchParamsReadingComponent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await new Promise((r) => process.nextTick(r))
  const fooParams = (
    searchParams as unknown as UnsafeUnwrappedSearchParams<typeof searchParams>
  ).foo
  return (
    <div>
      this component read the accessed the `foo` search param: {fooParams}
    </div>
  )
}

async function LongRunningComponent() {
  await new Promise((r) =>
    process.nextTick(async () => {
      await 1
      process.nextTick(r)
    })
  )
  return (
    <div>
      this component took a long time to resolve (but still before the dynamicIO
      cutoff). It might not be done before the sync searchParams access happens.
    </div>
  )
}

async function ShortRunningComponent() {
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
