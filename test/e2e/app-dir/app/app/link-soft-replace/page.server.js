import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/with-id" replace soft>
      <a id="link">With ID</a>
    </Link>
  )
}
