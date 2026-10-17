import { Suspense } from 'react'

// Unconfigured control for the closed-prefix catch-all route. Encoding must
// survive regardless of whether an explicit matching policy is present.
async function Content({ params }: { params: Promise<{ parts: string[] }> }) {
  const { parts } = await params
  return <p id="params">{parts.join('/')}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ parts: string[] }>
}) {
  return (
    <main>
      <h1>Unconfigured documentation</h1>
      <Suspense fallback={<p>Loading documentation</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  )
}
