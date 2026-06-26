'use client'

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
  // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
  const fooParam = (searchParams as any).foo
  return (
    <div>
      this component reads the `foo` search param:{' '}
      <span id="foo-param">{String(fooParam)}</span>
    </div>
  )
}
