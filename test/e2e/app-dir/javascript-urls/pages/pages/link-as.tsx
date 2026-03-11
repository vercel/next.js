import Link from 'next/link'

import { DANGEROUS_JAVASCRIPT_URL } from '../../bad-url'

export default function Page() {
  return (
    <div>
      <main>
        <p>
          Clicking this link should result in an error where React blocks a
          javascript URL
        </p>
        <Link href="/" as={DANGEROUS_JAVASCRIPT_URL}>
          Link with javascript URL `as`
        </Link>
      </main>
      <footer>
        <Link href="/pages/safe">Safe Page</Link>
      </footer>
    </div>
  )
}
