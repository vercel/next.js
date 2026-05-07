import Link from 'next/link'

export default function OrgNotFound() {
  return (
    <main>
      <h1>Org section not found</h1>
      <ul>
        <li>
          <Link href="/org/acme/missing-two">
            Visit another missing org route
          </Link>
        </li>
      </ul>
    </main>
  )
}
