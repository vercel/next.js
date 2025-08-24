import { Suspense } from 'react'

export async function generateMetadata() {
  await new Promise((r) => setTimeout(r, 0))
  return { title: 'Dynamic Metadata' }
}

export default async function Page() {
  return (
    <>
      <p>
        This page has dynamic content and generateMetadata is also dynamic.
        generateMetadata being dynamic in this context is fine because it isn't
        the only reason the page is dynamic.
      </p>
      <Suspense fallback={<Fallback />}>
        <Dynamic />
      </Suspense>
    </>
  )
}

function Fallback() {
  return <div data-fallback="">loading...</div>
}

async function Dynamic() {
  await new Promise((r) => setTimeout(r))
  return <p id="dynamic">Dynamic</p>
}
