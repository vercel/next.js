// Prerendered at build with time-based revalidation, and served from the ISR
// cache. The period is long, so the page never becomes stale during the test.
// With Cache Components, where `revalidate` isn't allowed, the test replaces
// this file with a `'use cache'` variant (see `ISR_PAGE_CACHE_COMPONENTS`).
export const revalidate = 3600

export default function Page() {
  return <p id="marker">ISR page</p>
}
