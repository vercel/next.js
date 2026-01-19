import Link from 'next/link'
import { Search } from './search'

type AnySearchParams = { [key: string]: string | Array<string> | undefined }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  await new Promise((resolve) => setTimeout(resolve, 3000))

  return (
    <main id="page-content">
      <Search />
      <p id="search-value">Search Value: {(await searchParams).q ?? 'None'}</p>
      <Link href="/search" prefetch>
        Home
      </Link>
    </main>
  )
}
