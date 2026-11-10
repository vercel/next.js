import Link from 'next/link'

export default function Home() {
  return (
    <Link href="/first" id="catchall-link">
      Go to catchall
    </Link>
  )
}
