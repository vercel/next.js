// Expect: INSTANT (via loading.tsx) — the page blocks, but the sibling
// loading.tsx remounts a fresh LoadingBoundary in the changed subtree on
// navigation, so its fallback shows instantly.
export default async function Page() {
  const res = await fetch('https://api.example.com/feed')
  const feed = await res.json()
  return <ul>{feed.length}</ul>
}
