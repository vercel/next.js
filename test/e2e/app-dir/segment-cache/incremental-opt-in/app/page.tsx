import Link from 'next/link'

export default function Page() {
  return (
    <ul>
      <li>
        <Link href="/ppr-enabled">Page with PPR enabled</Link>
      </li>
      <li>
        <Link href="/ppr-enabled/dynamic-param">
          Page with PPR enabled but has dynamic param
        </Link>
      </li>
      <li>
        <Link href="/ppr-disabled">Page with PPR disabled</Link>
      </li>
    </ul>
  )
}
