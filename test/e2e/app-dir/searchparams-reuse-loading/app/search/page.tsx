import { Search } from './search'

export default async function Page({ searchParams }: { searchParams: any }) {
  await new Promise((resolve) => setTimeout(resolve, 3000))

  return (
    <main id="page-content">
      <Search />
      <p id="search-value">Search Value: {searchParams.q ?? 'None'}</p>
    </main>
  )
}
