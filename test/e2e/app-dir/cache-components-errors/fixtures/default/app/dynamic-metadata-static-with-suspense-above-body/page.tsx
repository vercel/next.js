export async function generateMetadata() {
  await new Promise((r) => setTimeout(r, 0))
  return { title: 'Dynamic Metadata' }
}

export default async function Page() {
  return (
    <>
      <p>
        This page is static except for `generateMetadata`. The root layout wraps
        the document body in a Suspense boundary. Wrapping the body in Suspense
        is the opt-in for a fully dynamic shell, which is the documented
        mitigation for dynamic `generateViewport`, but is NOT a documented
        mitigation for dynamic `generateMetadata`. So even with Suspense above
        body, we still expect the dynamic-metadata error to be shown to nudge
        users back toward making `generateMetadata` static (or, secondarily,
        making the page partially dynamic).
      </p>
      <span id="sentinel">sentinel</span>
    </>
  )
}
