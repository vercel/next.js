export const instant = { level: 'experimental-error' }

export default async function Page({ searchParams }) {
  await searchParams
  return (
    <main>
      <p>
        For a statically prefetchable page, Runtime content needs a Suspense
        boundary, but it's missing here, so we should error
      </p>
    </main>
  )
}
