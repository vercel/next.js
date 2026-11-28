import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1>Hash initial load</h1>
      <Link href="/hash-initial-load#bar" id="link-to-bar">
        Link to #bar
      </Link>
      <Link href="/hash-initial-load" id="link-without-hash">
        Link without a hash
      </Link>
    </>
  )
}
