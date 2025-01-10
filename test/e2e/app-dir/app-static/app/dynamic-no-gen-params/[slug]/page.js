'use client'
import { use } from 'react'

import Link from 'next/link'

export default function Page(props) {
  const params = use(props.params)
  return (
    <>
      <p id="page">/dynamic-no-gen-params</p>
      <p id="params">{JSON.stringify(params)}</p>

      <Link href="/dynamic-no-gen-params/second" id="dynamic-no-params-again">
        /dynamic-no-gen-params/second
      </Link>
      <br />

      <Link href="/blog/styfle" id="to-blog">
        /blog/styfle
      </Link>
      <br />
    </>
  )
}
