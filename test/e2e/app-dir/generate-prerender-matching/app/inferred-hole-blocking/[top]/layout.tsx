import { Suspense, type ReactNode } from 'react'

export default async function TopLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ top: string }>
}) {
  const { top } = await params

  return (
    <section data-top={top}>
      <Suspense
        fallback={<p id="inferred-hole-blocking-shell">waiting for bottom</p>}
      >
        {children}
      </Suspense>
    </section>
  )
}
