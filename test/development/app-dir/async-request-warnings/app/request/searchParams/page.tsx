function Component({
  searchParams,
}: {
  searchParams: Record<string, unknown>
}) {
  const a = searchParams.slug
  const b = searchParams.slug

  const clonedSearchParams = { ...searchParams }
  return <pre>{JSON.stringify({ clonedSearchParams, a, b }, null, 2)}</pre>
}

export default function Page({
  searchParams,
}: {
  searchParams: Record<string, unknown>
}) {
  const slug = searchParams.slug

  return (
    <>
      <pre>{JSON.stringify({ slug }, null, 2)}</pre>
      <Component searchParams={searchParams} />
      <Component searchParams={searchParams} />
    </>
  )
}
