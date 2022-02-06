import Link from 'next/link'

export default function ToNonexistent() {
  return (
    <div id="blackhole-page">
      <Link href="/nonexistent">
        <a id="to-nonexistent-page">Nonexistent Page</a>
      </Link>
    </div>
  )
}
