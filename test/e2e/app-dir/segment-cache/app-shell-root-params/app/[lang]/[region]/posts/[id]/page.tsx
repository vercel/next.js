import { Suspense } from 'react'
import { region } from 'next/root-params'

type Params = { id: string }

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      {/* The fallback is the App Shell — the part of the page that doesn't
          depend on the dynamic params. Nothing above this boundary reads the
          `region` root param, so the shell does not vary on `region`. */}
      <Suspense fallback={<p id="shell">App shell for posts</p>}>
        <ParamsDependent params={params} />
      </Suspense>
    </main>
  )
}

async function ParamsDependent({ params }: { params: Promise<Params> }) {
  'use cache'

  const { id } = await params
  // `region` is a root param, but it's only read here — below the shell
  // boundary, in the dynamic content — so it's not part of the shell.
  const currentRegion = await region()
  return <p id="dynamic-content">{`Post ${id} for region ${currentRegion}`}</p>
}
