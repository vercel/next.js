export const instant = false

export async function generateMetadata() {
  await new Promise((r) => setTimeout(r, 0))
  return { title: 'Dynamic Metadata' }
}

export default async function Page() {
  return (
    <>
      <p>
        This page is static except for `generateMetadata`. It opts into a fully
        dynamic, blocking route via `export const instant = false`. That opt-in
        is a synonym for wrapping the document body in a Suspense boundary — it
        says the user accepts a blocking route — but it is NOT a documented
        mitigation for dynamic `generateMetadata`. So even with the opt-in, we
        still expect the dynamic-metadata error to be shown to nudge users back
        toward making `generateMetadata` static (or, secondarily, making the
        page partially dynamic).
      </p>
      <span id="sentinel">sentinel</span>
    </>
  )
}
