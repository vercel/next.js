import { cacheLife } from 'next/cache'
import { Suspense } from 'react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <Suspense fallback={null}>
          <ConditionalNavigation />
        </Suspense>
        {children}
      </body>
    </html>
  )
}

async function ConditionalNavigation() {
  await getConditionalNavigationState()
  return null
}

async function getConditionalNavigationState() {
  'use cache'

  cacheLife({ revalidate: 0, expire: 0 })
  cacheLife({ stale: 60 })

  return false
}
