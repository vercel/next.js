// Reads searchParams so the render varies on them and the transition event's
// searchParams are populated in every delivery mode. The event reports the
// search the server actually rendered against (the vary path), not the request
// URL — so a page that ignores searchParams serves a shared prerender (when
// deployed) whose renderedSearch, and therefore the event's searchParams, is
// empty. Under cache components the test setup overlays `export const instant =
// false` (dynamic access with no Suspense boundary above it).
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const search = await searchParams
  return <h1 id="docs-page">Docs: {JSON.stringify(search)}</h1>
}
