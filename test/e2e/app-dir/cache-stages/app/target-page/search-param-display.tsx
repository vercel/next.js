export async function SearchParamDisplay({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  return <p id="search-param">search: {q ?? 'none'}</p>
}
