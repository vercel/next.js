import { unstable_cache } from 'next/cache'

export const revalidate = 3600

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await unstable_cache(
    async (params: typeof searchParams) => (await params).query,
    ['nested-search-params']
  )(searchParams)

  return <p id="query">{query}</p>
}
