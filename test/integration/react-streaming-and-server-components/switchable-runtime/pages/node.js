import Runtime from '../utils/runtime'
import Time from '../utils/time'

import Link from 'next/link'

export default function Page() {
  return (
    <div>
      This is a static page.
      <br />
      <Runtime />
      <br />
      <Time />
      <br />
      <Link href="/node-rsc">
        <a>to /node-rsc</a>
      </Link>
      <br />
      <Link href="/node-rsc-ssg">
        <a>to /node-rsc-ssg</a>
      </Link>
      <br />
      <Link href="/node-rsc-ssr">
        <a>to /node-rsc-ssr</a>
      </Link>
      <br />
      <Link href="/node-ssg">
        <a>to /node-ssg</a>
      </Link>
      <br />
      <Link href="/node-ssr">
        <a>to /node-ssr</a>
      </Link>
    </div>
  )
}

export const config = {
  runtime: 'nodejs',
}
