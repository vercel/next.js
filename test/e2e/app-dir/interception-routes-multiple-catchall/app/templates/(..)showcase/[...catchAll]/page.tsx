import Link from 'next/link'
import React from 'react'

async function Page() {
  return (
    <div id="intercepting-page">
      Showcase Intercepting Page
      <Link href="/templates/single">Single</Link>
    </div>
  )
}

export default Page
