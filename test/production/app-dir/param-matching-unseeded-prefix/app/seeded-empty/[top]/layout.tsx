import { Suspense, type ReactNode } from 'react'

export function generateStaticParams() {
  return [{ top: 't1' }]
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ top: string }>
}) {
  const { top } = await params
  return (
    <section data-top={top}>
      <Suspense fallback={<p>Waiting for bottom</p>}>{children}</Suspense>
    </section>
  )
}
