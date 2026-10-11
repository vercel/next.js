import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/fixture" prefetch={false}>
      Open fixture
    </Link>
  )
}
