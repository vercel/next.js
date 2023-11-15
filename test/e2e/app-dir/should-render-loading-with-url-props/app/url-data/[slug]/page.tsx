export interface PageProps {
  searchParams: Record<string, string>
  params: {
    slug: string
  }
}

const wait = async (ms: number): Promise<void> => {
  return await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export default async function Page({ searchParams, params }: PageProps) {
  await wait(2_000)

  return (
    <h1
      id="page-url-data"
      data-params-slug={params.slug ?? 'N/A'}
      data-search-params-first={searchParams.first ?? 'N/A'}
      data-search-params-second={searchParams.second ?? 'N/A'}
    >
      Search Params Page
    </h1>
  )
}
