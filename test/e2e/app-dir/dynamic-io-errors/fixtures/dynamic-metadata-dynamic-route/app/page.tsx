import { Suspense } from 'react'

export async function generateMetadata() {
  await new Promise((r) => setTimeout(r, 0))
  return { title: 'Dynamic Metadata' }
}

export default async function Page() {
  return (
    <>
      <p>
        This page is static except for generateMetadata which does some IO. This
        is a build error because metadata is not wrapped in a Suspense boundary.
        We expect that if you intended for your metadata to be dynamic you will
        ensure your page is dynamic too
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
