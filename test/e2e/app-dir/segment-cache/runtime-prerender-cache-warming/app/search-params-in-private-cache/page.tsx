export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  'use cache: private'
  return (
    <main>
      <p id="search">{`Search: ${JSON.stringify(await searchParams)}`}</p>
    </main>
  )
}
