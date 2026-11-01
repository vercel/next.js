import Link from 'next/link'
import { CatalogLink } from '@/components/catalog-link'

export default function HomePage() {
  return (
    <main>
      <h1>Signal Records</h1>
      <ul>
        <li>
          <Link href="/tracks/aurora" prefetch={true}>
            Aurora — explicit eager link
          </Link>
        </li>
        <li>
          <Link href="/tracks/aurora" prefetch>
            Aurora — bare eager link
          </Link>
        </li>
        <li>
          <CatalogLink href="/tracks/aurora" eager>
            Aurora — eager catalog wrapper
          </CatalogLink>
        </li>
        <li>
          <Link href="/tracks/nebula">Nebula — default link</Link>
        </li>
        <li>
          <Link href="/tracks/nebula" prefetch="auto">
            Nebula — automatic link
          </Link>
        </li>
        <li>
          <Link href="/tracks/nebula" prefetch={false}>
            Nebula — prefetch disabled
          </Link>
        </li>
      </ul>
    </main>
  )
}
