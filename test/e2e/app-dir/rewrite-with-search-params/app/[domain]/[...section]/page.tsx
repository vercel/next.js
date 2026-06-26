export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string; section: string[] }>
  searchParams: Promise<{ [key: string]: string | string[] }>
}) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams

  return (
    <>
      <div>
        <h2>Params:</h2>
        <pre id="params-value">{JSON.stringify(resolvedParams, null, 2)}</pre>
      </div>
      <div>
        <h2>Search Params:</h2>
        <pre id="search-params-value">
          {JSON.stringify(resolvedSearchParams, null, 2)}
        </pre>
      </div>
    </>
  )
}
