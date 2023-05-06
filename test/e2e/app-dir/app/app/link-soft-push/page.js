import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/with-id" id="link">
      With ID
    </Link>
  )
}
