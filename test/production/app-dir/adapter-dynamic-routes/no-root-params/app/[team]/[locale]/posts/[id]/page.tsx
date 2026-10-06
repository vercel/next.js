import { Suspense } from 'react'

// This page does not resolve `id`. The build therefore produces one fallback
// shell for each root param combination.
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>loading</p>}>
      {params.then(({ id }) => (
        <p>{id}</p>
      ))}
    </Suspense>
  )
}
