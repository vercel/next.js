import Link from 'next/link'
import React from 'react'

export default async function Page({ params }) {
  return (
    <div id={`dynamic-page-${params.slug[0]}`}>
      <p id="params">Params: {JSON.stringify(params)}</p>
      {[1, 2].map((i) => (
        <div key={i}>
          <Link href={`/catch-all/${i}`}>Go to /catch-all/{i}</Link>
        </div>
      ))}
    </div>
  )
}
