async function getSearchParam({
  searchParams,
}: {
  searchParams: Promise<{ n: string }>
}): Promise<string> {
  'use cache'

  return (await searchParams).n
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n: string }>
}) {
  let searchParam: string | undefined

  try {
    searchParam = await getSearchParam({ searchParams })
  } catch {
    // Ignore not having access to searchParams. This is still an invalid
    // dynamic access though that we need to detect.
  }

  return (
    <p>{searchParam ? `search param: ${searchParam}` : 'no search param'}</p>
  )
}
