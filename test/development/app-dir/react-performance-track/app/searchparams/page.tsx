export default async function SearchParamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, unknown>>
}) {
  return <p>Done {JSON.stringify(await searchParams)}</p>
}
