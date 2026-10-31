// This layout reads runtime data (cookies), so it needs a runtime prefetch
// to resolve fully. Static parents above it should still be able to inline
// through it and into the static child below — the chain isn't broken.
import { ReactNode, Suspense } from 'react'
import { cookies } from 'next/headers'

export const instant = {
  unstable_samples: [{ cookies: [{ name: 'theme', value: 'default' }] }],
}
export const prefetch = 'partial'

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
