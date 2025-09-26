import { Suspense } from 'react'
import { connection } from 'next/server'

async function DynamicContentInSharedLayout() {
  await connection()
  return (
    <div id="dynamic-content-in-shared-layout">
      Dynamic content in shared layout
    </div>
  )
}

export default function SharedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div id="shared-layout">
      <Suspense
        fallback={
          <div id="shared-layout-ppr-boundary">
            Loading (PPR shell of shared-layout)...
          </div>
        }
      >
        <DynamicContentInSharedLayout />
      </Suspense>
      {children}
    </div>
  )
}
