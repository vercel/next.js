import { connection } from 'next/server'
import { Suspense } from 'react'

type SearchParams = { foo: string | string[] | undefined }
export default async function Page(props: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <>
      <p>
        This page accesses searchParams synchronously. This does not trigger
        dynamic, and the build should succeed. In dev mode, we do log an error
        for the sync access though.
      </p>
      <SearchParamsReadingComponent searchParams={props.searchParams} />
      <Suspense>
        <Dynamic />
      </Suspense>
    </>
  )
}

async function SearchParamsReadingComponent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
  const fooParam = (searchParams as any).foo
  return (
    <div>
      this component reads the `foo` search param:{' '}
      <span id="foo-param">{String(fooParam)}</span>
    </div>
  )
}

// This component ensures that we're creating a partially prerendered page, so
// that we also test that there are no sync search params defined during the
// resume.
async function Dynamic() {
  await connection()

  return null
}
