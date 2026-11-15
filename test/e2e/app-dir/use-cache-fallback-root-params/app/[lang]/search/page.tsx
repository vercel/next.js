export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>
}) {
  'use cache: private'
  return <p>Search: {(await searchParams).query}</p>
}
