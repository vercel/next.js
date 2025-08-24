'use client'

import Link from 'next/link'
import React from 'react'

export default function Page() {
  const broken = (
    <>
      <Link href="/invalid" as="mailto:john@example.com">
        <a>Invalid link</a>
      </Link>
    </>
  )

  const [shouldShow, setShouldShow] = React.useState(false)

  return (
    <div>
      <button onClick={() => setShouldShow(true)}>break on client</button>
      {shouldShow && broken}
    </div>
  )
}
