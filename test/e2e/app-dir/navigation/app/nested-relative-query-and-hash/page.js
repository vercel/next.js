import Link from 'next/link'
import { RouterPushButton } from './client-component'

export default function Page() {
  return (
    <>
      <h1 id="h1">
        <Link href="#h1" id="link-to-h1-hash-only">
          To #h1, hash only
        </Link>
      </h1>

      <p>
        <Link href="?foo=1&bar=2" id="link-to-dummy-query">
          Query only
        </Link>
      </p>

      <h2 id="h2">
        <Link href="?here=ok#h2" id="link-to-h2-with-hash-and-query">
          To #h2, with both relative hash and query
        </Link>
      </h2>

      <RouterPushButton />
    </>
  )
}
