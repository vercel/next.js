import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1>Build Error Scenarios Test</h1>
      <p>
        These routes SHOULD cause MissingDefaultParallelRouteError because they
        have parallel routes without default.tsx files AND have child routes.
      </p>
      <nav>
        <ul>
          <li>
            <Link href="/with-children">
              Non-Leaf Segment with Children (SHOULD ERROR)
            </Link>
          </li>
          <li>
            <Link href="/with-groups-and-children">
              Non-Leaf with Route Groups and Children (SHOULD ERROR)
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  )
}
