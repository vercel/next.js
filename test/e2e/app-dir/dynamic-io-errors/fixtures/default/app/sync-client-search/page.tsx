'use client'

import { type UnsafeUnwrappedSearchParams } from 'next/server'

type SearchParams = { foo: string | string[] | undefined }
export default function Page(props: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <p>
        This page accesses searchParams synchronously. This does not trigger
        dynamic, and the build should succeed. In dev mode, we do log an error
        for the sync access though.
      </p>
      <SearchParamsReadingComponent searchParams={props.searchParams} />
    </>
  )
}

function SearchParamsReadingComponent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const fooParam = (
    searchParams as unknown as UnsafeUnwrappedSearchParams<typeof searchParams>
  ).foo
  return (
    <div>
      this component reads the `foo` search param:{' '}
      <span id="foo-param">{String(fooParam)}</span>
    </div>
  )
}
