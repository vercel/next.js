import { unstable_noStore } from 'next/cache'
import Link from 'next/link'
import React, { Suspense } from 'react'

export default async function Page(props) {
  const params = await props.params
  return (
    <div id={`dynamic-page-${params.slug[0]}`}>
      <p id="params">Params: {JSON.stringify(params)}</p>
      {[1, 2].map((i) => (
        <div key={i}>
          <Link href={`/catch-all/${i}`}>Go to /catch-all/{i}</Link>
        </div>
      ))}
      <Suspense fallback={<div id="fallback">Loading...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}

function Dynamic() {
  unstable_noStore()
  return <div id="dynamic">Dynamic content</div>
}
