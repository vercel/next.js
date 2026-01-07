export async function generateMetadata() {
  await new Promise((r) => setTimeout(r, 0))
  return { title: 'Dynamic Metadata' }
}

export default async function Page() {
  return (
    <>
      <p>
        This page has dynamic metadata and is also dynamic in the page without a
        Suspense boundary. This is violation of cache components rules. This
        test exists however because there was previously a bug that would
        incorrectly report this as an invariant error.
      </p>
      <Dynamic />
    </>
  )
}

async function Dynamic() {
  await new Promise((r) => setTimeout(r))
  return <p id="dynamic">Dynamic</p>
}
