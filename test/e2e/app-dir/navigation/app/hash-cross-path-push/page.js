import Link from 'next/link'
import { RouterPushToTarget } from './client-component'

export default function Page() {
  return (
    <>
      <h1>Start</h1>
      <Link
        href="/hash-cross-path-push/destination#foo"
        id="link-to-target-foo"
      >
        Link to destination#foo
      </Link>
      <RouterPushToTarget />
    </>
  )
}
