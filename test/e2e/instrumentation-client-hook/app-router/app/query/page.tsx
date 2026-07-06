// Reads searchParams so the rendered payload is search-specific in every
// delivery mode. (A static page that ignores searchParams serves a shared
// prerendered payload when deployed, whose renderedSearch — and therefore the
// transition events' searchParams — is empty.) Like /slow, this is a
// blocking route: under cache components the test setup patches in
// `export const instant = false`.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  return <h1 id="query-page">Query page: {JSON.stringify(params)}</h1>
}
