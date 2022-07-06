import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/with-date" soft>
      <a id="link">With Date</a>
    </Link>
  )
}
