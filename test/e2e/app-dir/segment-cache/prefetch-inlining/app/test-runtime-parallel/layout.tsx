// Runtime layout with parallel routes. The parent's data should pass through
// this layout into one child slot only — not into both. This tests that the
// pass-through behavior respects the "parent inlines into one child" rule
// even when the pass-through segment has multiple child slots.
import { ReactNode, Suspense } from 'react'
import { cookies } from 'next/headers'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [{ name: 'theme', value: 'default' }] }],
}
export const unstable_prefetch = 'runtime'

async function DynamicContent() {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value ?? 'default'
  return <p id="layout-runtime-parallel">Runtime layout (theme: {theme})</p>
}

export default function RuntimeParallelLayout({
  children,
  sidebar,
}: {
  children: ReactNode
  sidebar: ReactNode
}) {
  return (
    <div>
      <Suspense fallback={<p>Loading layout...</p>}>
        <DynamicContent />
      </Suspense>
      <main>{children}</main>
      <aside>{sidebar}</aside>
    </div>
  )
}
