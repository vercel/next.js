import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/items/expected-id" prefetch={false}>
      Open item
    </Link>
  )
}
