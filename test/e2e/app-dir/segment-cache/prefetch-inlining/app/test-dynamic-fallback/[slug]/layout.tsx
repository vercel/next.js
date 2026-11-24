import { Suspense, type ReactNode } from 'react'
import { NoInline } from '../../../components/no-inline'

// A layout that awaits `params` behind a Suspense boundary. On a concrete
// render, the resolved content exceeds the 2KB gzip inlining threshold so the
// layout is outlined. On the fallback shell render, the Suspense fallback is
// small and would be inlined if the fallback shell measured its own sizes
// instead of reusing the route's inlining decisions.
async function LayoutHeader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <div>
      <NoInline />
      <p id="fallback-layout-header">{`Fallback layout for: ${slug}`}</p>
    </div>
  )
}

export default function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  return (
    <div>
      <Suspense fallback={<p>Loading layout...</p>}>
        <LayoutHeader params={params} />
      </Suspense>
      {children}
    </div>
  )
}
