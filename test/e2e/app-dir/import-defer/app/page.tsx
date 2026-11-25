import Link from 'next/link'

export default function Page() {
  return (
    <ul>
      <li>
        <Link href="/server">server</Link>
      </li>
      <li>
        <Link href="/client-reference">client-reference</Link>
      </li>
      <li>
        <Link href="/client">client</Link>
      </li>
      <li>
        <Link href="/action">action</Link>
      </li>
    </ul>
  )
}
