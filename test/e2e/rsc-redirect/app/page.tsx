import Link from 'next/link'
import React from 'react'

export default function Page() {
  return (
    <div>
      <div>
        <Link href="/next-config-redirect" prefetch={false}>
          Go to Next Config Redirect Page
        </Link>
      </div>
      <div>
        <Link href="/rsc-redirect" prefetch={false}>
          Go to RSC redirect page
        </Link>
      </div>
      <div>
        <Link href="/about" prefetch={false}>
          Go to About Page
        </Link>
      </div>
      <div>
        <Link href="/old-about" prefetch={false}>
          Go to (Old) About Page
        </Link>
      </div>
    </div>
  )
}
