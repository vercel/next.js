import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ one: 'generated' }]
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ one: string }>
}) {
  // No Suspense boundary above this read: the generic shell is empty, but
  // completing `one` produces a nonempty shell around the deferred `two`.
  const { one } = await params

  return (
    <div>
      <div id="one" data-rendered-at={performance.now().toString()}>
        {one}
      </div>
      {children}
    </div>
  )
}
