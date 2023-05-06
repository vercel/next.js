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
      <Link href="/node-rsc" id="link-node-rsc">
        to /node-rsc
      </Link>
      <br />
      <Link href="/node-rsc-ssg" id="link-node-rsc-ssg">
        to /node-rsc-ssg
      </Link>
      <br />
      <Link href="/node-rsc-ssr" id="link-node-rsc-ssr">
        to /node-rsc-ssr
      </Link>
      <br />
      <Link href="/node-rsc-isr" id="link-node-rsc-isr">
        to /node-rsc-isr
      </Link>
      <br />
      <Link href="/node-ssg" id="link-node-ssg">
        to /node-ssg
      </Link>
      <br />
      <Link href="/node-ssr" id="link-node-ssr">
        to /node-ssr
      </Link>
    </div>
  )
}

export const config = {
  runtime: 'nodejs',
}
