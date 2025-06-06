import Link from 'next/link'
import React from 'react'

export default function Page() {
  return (
    <div>
      <div>
        <Link href="/next-config-redirect">
          Go to Next Config Redirect Page
        </Link>
      </div>
      <div>
        <Link href="/rsc-redirect">Go to RSC redirect page</Link>
      </div>
      <div>
        <Link href="/about">Go to About Page</Link>
      </div>
      <div>
        <Link href="/old-about">Go to (Old) About Page</Link>
      </div>
    </div>
  )
}
