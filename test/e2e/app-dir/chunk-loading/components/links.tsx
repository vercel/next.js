import Link from 'next/link'

export function Links() {
  return (
    <ul>
      <li>
        <Link href="/feed">Feed</Link>
      </li>
      <li>
        <Link href="/account">Account</Link>
      </li>
      <li>
        <Link href="/page/about">about</Link>
      </li>
      <li>
        <Link href="/">Home</Link>
      </li>
    </ul>
  )
}
