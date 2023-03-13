import Link from 'next/link'

export default function Header() {
  return (
    <div>
      <Link href="/" style={{ marginRight: 10 }}>
        Home
      </Link>

      <Link href="/about" style={{ marginRight: 10 }}>
        About
      </Link>
    </div>
  )
}
