import { PageProps } from './page'

export default function Loading({ searchParams, params }: PageProps) {
  return (
    <h1
      id="loading-url-data"
      data-params-slug={params.slug ?? 'N/A'}
      data-search-params-first={searchParams.first ?? 'N/A'}
      data-search-params-second={searchParams.second ?? 'N/A'}
    >
      Search Params Loading...
    </h1>
  )
}
