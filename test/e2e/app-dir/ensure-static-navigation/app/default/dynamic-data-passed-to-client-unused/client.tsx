'use client'

import { use } from 'react'

export function UserServerDataOnlyInBrowser({
  serverData,
}: {
  serverData: Promise<string>
}) {
  // A client component might save a promise of server data without actually
  // calling use() during the prerender, which would not surface as a dynamic
  // hole during the prerender.
  if (typeof window !== 'undefined') {
    const data = use(serverData)
    return <p suppressHydrationWarning>{`Server data: ${data}`}</p>
  } else {
    return (
      <p
        suppressHydrationWarning
      >{`Server data: <skipped during prerender>`}</p>
    )
  }
}
