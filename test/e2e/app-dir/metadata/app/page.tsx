import React from 'react'
import Link from 'next/link'

export default function Page() {
  return (
    <>
      <header>
        <meta itemProp="accessibilityControl" content="fullMouseControl" />
      </header>
      <p id="index">index page</p>

      <Link href="/basic" id="to-basic">
        to /basic
      </Link>
      <br />
      <Link href="/title" id="to-title">
        to /title
      </Link>
      <br />
      <Link href="/title-template/extra/inner" id="to-nested">
        to /title-template/extra/inner
      </Link>
      <br />
    </>
  )
}

export const metadata = {
  title: 'index page',
}
