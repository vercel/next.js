import Link from 'next/link'

export default function Header() {
  return (
    <div>
      <Link href="/">
        <a style={{ marginRight: 10 }}>Home</a>
      </Link>

      <Link href="/about">
        <a style={{ marginRight: 10 }}>About</a>
      </Link>
    </div>
  )
}
