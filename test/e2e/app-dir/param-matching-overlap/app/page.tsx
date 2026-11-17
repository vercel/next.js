import Link from 'next/link'

export default function Page() {
  return (
    <main id="hub">
      <Link href="/docs/messages/known" id="to-known">
        known
      </Link>
      <Link href="/docs/messages/unknown" id="to-unknown">
        unknown
      </Link>
      <Link href="/docs/ordinary" id="to-ordinary">
        ordinary
      </Link>
    </main>
  )
}
