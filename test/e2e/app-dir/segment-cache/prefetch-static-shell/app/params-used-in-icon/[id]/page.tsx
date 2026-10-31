import { connection } from 'next/server'
import { Suspense } from 'react'

type Props = { params: Promise<{ id: string }> }

export default async function Page(props: Props) {
  return (
    <main>
      <p id="page-content">Params awaited in icon.tsx and after dynamic data</p>
      <Suspense
        fallback={<p id="dynamic-loading">Loading dynamic content...</p>}
      >
        <Dynamic {...props} />
      </Suspense>
    </main>
  )
}

async function Dynamic(props: Props) {
  // The prerender ends here, so it doesn't observe params being awaited.
  await connection()

  return (
    <>
      <div id="dynamic-content">Dynamic content</div>
      <ParamsDependent {...props} />
    </>
  )
}

async function ParamsDependent(props: Props) {
  const { id } = await props.params
  return <p id="param-value">Post: {id}</p>
}
