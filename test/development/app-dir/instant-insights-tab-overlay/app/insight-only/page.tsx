export default async function Page() {
  // Uncached fetch under the parent Suspense — fails navigation-instant
  // validation. Surfaces as an Instant Insight.
  const res = await fetch('http://example.com', { cache: 'no-store' })
  return <p>Status: {res.status}</p>
}
