import { ReactNode, Suspense } from 'react'
import { cookies } from 'next/headers'

// This layout uses runtime prefetching and sits ABOVE the [item] param.
// It's shared between /test-independent-head/a and /test-independent-head/b.
// Once cached from the first prefetch, a subsequent prefetch to a sibling
// page won't need a runtime request for this layout — it's already cached.
export const unstable_instant = {
  unstable_samples: [
    {
      cookies: [{ name: 'theme', value: 'default' }],
      searchParams: { q: null },
      params: { item: 'a' },
    },
  ],
}
export const prefetch = 'allow-runtime'

async function LayoutContent({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value ?? 'default'
  return (
    <div>
      <p id="layout-independent-head">Shared layout (theme: {theme})</p>
      {children}
    </div>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p>Loading layout...</p>}>
      <LayoutContent>{children}</LayoutContent>
    </Suspense>
  )
}
