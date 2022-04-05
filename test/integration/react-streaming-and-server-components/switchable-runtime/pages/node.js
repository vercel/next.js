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
        <a id="link-node-rsc">to /node-rsc</a>
      </Link>
      <br />
      <Link href="/node-rsc-ssg">
        <a id="link-node-rsc-ssg">to /node-rsc-ssg</a>
      </Link>
      <br />
      <Link href="/node-rsc-ssr">
        <a id="link-node-rsc-ssr">to /node-rsc-ssr</a>
      </Link>
      <br />
      <Link href="/node-rsc-isr">
        <a id="link-node-rsc-isr">to /node-rsc-isr</a>
      </Link>
      <br />
      <Link href="/node-ssg">
        <a id="link-node-ssg">to /node-ssg</a>
      </Link>
      <br />
      <Link href="/node-ssr">
        <a id="link-node-ssr">to /node-ssr</a>
      </Link>
    </div>
  )
}

export const config = {
  runtime: 'nodejs',
}
