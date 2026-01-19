export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  'use cache: private'

  const { q } = await searchParams

  return (
    <p>
      Query: <span id="search-param">{q}</span>
    </p>
  )
}
