'use client'

import { type ReactNode, Suspense, use, useEffect, useState } from 'react'
import { createFromFetch } from 'react-server-dom-webpack/client'

function FromRoute({ response }: { response: Promise<ReactNode> }) {
  return <>{use(response)}</>
}

export default function Page() {
  const [response, setResponse] = useState<Promise<ReactNode> | null>(null)

  // Fetch in the browser only, so the client component inside the payload is
  // loaded through the Route Handler's manifest.
  useEffect(() => {
    setResponse(createFromFetch(fetch('/rsc')))
  }, [])

  return (
    <main>
      {response && (
        <Suspense fallback={<p>loading</p>}>
          <FromRoute response={response} />
        </Suspense>
      )}
    </main>
  )
}
