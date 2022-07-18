import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/with-id">
      <a id="link">With ID</a>
    </Link>
  )
}
