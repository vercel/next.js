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
        This page accesses searchParams synchronously and it triggers dynamic
        before another component is finished which doesn't define a fallback UI
        with Suspense. This is considered a build error and the message should
        clearly indicate that it was caused by a synchronous dynamic API usage.
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

async function SearchParamsReadingComponent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await new Promise((r) => process.nextTick(r))
  const fooParams = (
    searchParams as unknown as UnsafeUnwrappedSearchParams<typeof searchParams>
  ).foo

  console.log(
    'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
  )

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
