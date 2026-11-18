export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  return <pre id="query">{JSON.stringify(await searchParams)}</pre>
}
