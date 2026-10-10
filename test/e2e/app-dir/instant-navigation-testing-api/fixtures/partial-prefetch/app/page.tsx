import { TaggedLink as Link } from './components'

export default function HomePage() {
  return (
    <div>
      <h1 data-testid="home-title">Partial Prefetch Shell Test</h1>
      <ul>
        <li>
          <Link href="/static-params/prerendered">prefetch-auto link</Link>
        </li>
        <li>
          <Link href="/static-params/prerendered" prefetch={true}>
            prefetch-true link (prerendered)
          </Link>
        </li>
        <li>
          <Link href="/static-params/not-prerendered" prefetch={true}>
            prefetch-true link (not prerendered)
          </Link>
        </li>
        <li>
          <Link href="/search-params?myParam=testValue" prefetch={true}>
            Go to search params page
          </Link>
        </li>
        <li>
          <Link href="/ungenerated-params/anything" prefetch={true}>
            Go to ungenerated params page
          </Link>
        </li>
        <li>
          <Link href="/mixed-params/en/anything" prefetch={true}>
            Go to mixed params page
          </Link>
        </li>
      </ul>
    </div>
  )
}
