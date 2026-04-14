// This layout has runtime prefetching enabled. Static parents above it should
// be able to inline through it and into the static child below, because this
// layout acts as a transparent pass-through — its slot in the bundle is null
// but the chain isn't broken.
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
  return <p id="layout-runtime-passthrough">Runtime layout (theme: {theme})</p>
}

export default function RuntimePassthroughLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div>
      <Suspense fallback={<p>Loading layout...</p>}>
        <DynamicContent />
      </Suspense>
      {children}
    </div>
  )
}
