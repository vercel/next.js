// Reads searchParams so the render varies on them and the transition event's
// searchParams are populated in every delivery mode. The event reports what the
// server actually rendered against (the vary path), not the request URL — so a
// static page that ignores searchParams renders one shared payload whose
// renderedSearch, and therefore the event's searchParams, is empty. Like /slow
// and /query this is a blocking route with no Suspense boundary above the
// dynamic access, so under cache components the test setup overlays
// `export const instant = false`.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  return <h1 id="rewrite-target">Rewrite target: {JSON.stringify(params)}</h1>
}
