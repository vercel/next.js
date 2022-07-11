import { useSearchParams } from 'next/dist/client/components/hooks-client'

export default function Page() {
  const params = useSearchParams()

  return (
    <>
      <h1
        id="params"
        data-param-first={params.first ?? 'N/A'}
        data-param-second={params.second ?? 'N/A'}
        data-param-third={params.third ?? 'N/A'}
        data-param-not-real={params.notReal ?? 'N/A'}
      >
        hello from /hooks/use-search-params
      </h1>
    </>
  )
}
