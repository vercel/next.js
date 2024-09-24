import { useParams, useSearchParams } from 'next/navigation'

export function ParamsComponent() {
  const params = useParams()
  const searchParams = useSearchParams()

  return (
    <div>
      <h2>useParams()</h2>
      <pre id="use-params">{JSON.stringify(params, null, 2)}</pre>

      <h2>useSearchParams()</h2>
      <pre id="use-search-params">
        {JSON.stringify(
          Object.fromEntries(searchParams ? searchParams.entries() : []),
          null,
          2
        )}
      </pre>
    </div>
  )
}
