import { Search } from './search'

type AnySearchParams = { [key: string]: string | Array<string> | undefined }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  const search = await searchParams
  if (Object.keys(search).length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 30 * 1000))
  }

  return (
    <main id="page-content">
      <Search />
      <p id="search-value">Search Value: {search.q ?? 'None'}</p>
    </main>
  )
}
