import Link from 'next/link'

export function RouterPushToTarget() {
  return (
    <Link id="link-to-target-bar" href="/hash-cross-path-push/destination#bar">
      To destination#bar
    </Link>
  )
}
