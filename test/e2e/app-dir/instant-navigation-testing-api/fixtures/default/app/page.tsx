import { TaggedLink as Link } from './components'

export default function HomePage() {
  return (
    <div>
      <h1 data-testid="home-title">Instant Navigation API Test</h1>
      <ul>
        <li>
          <Link href="/target-page">Go to target page</Link>
        </li>
        <li>
          <Link href="/full-prefetch-target" prefetch={true}>
            Go to full prefetch target
          </Link>
        </li>
        <li>
          <Link href="/cookies-page">Go to cookies page</Link>
        </li>
        <li>
          <Link href="/cookies-with-param/x">
            Go to cookies-with-param page
          </Link>
        </li>
        <li>
          <Link href="/static-params/prerendered">
            Go to static params page
          </Link>
        </li>
        <li>
          <Link href="/static-params/not-prerendered">
            Go to static params page (param value not prerendered)
          </Link>
        </li>
        <li>
          <Link href="/ungenerated-params/anything">
            Go to ungenerated params page
          </Link>
        </li>
        <li>
          <Link href="/mixed-params/en/anything">Go to mixed params page</Link>
        </li>
        <li>
          <a href="/mixed-params/en/anything">Go to mixed params page (MPA)</a>
        </li>
        <li>
          <Link href="/mixed-params/pl/anything">
            Go to mixed params page (static param not prerendered)
          </Link>
        </li>
        <li>
          <a href="/mixed-params/pl/anything">
            Go to mixed params page (MPA, static param not prerendered)
          </a>
        </li>
        <li>
          <Link href="/search-params-page?foo=bar">
            Go to search params page
          </Link>
        </li>
        <li>
          <a href="/target-page">Go to target page (MPA)</a>
        </li>
        <li>
          <a href="/cookies-page">Go to cookies page (MPA)</a>
        </li>
        <li>
          <a href="/ungenerated-params/anything">
            Go to ungenerated params page (MPA)
          </a>
        </li>
        <li>
          <a href="/static-params/prerendered">
            Go to static params page (MPA)
          </a>
        </li>
        <li>
          <a href="/static-params/not-prerendered">
            Go to static params page (param value not prerendered) (MPA)
          </a>
        </li>
        <li>
          <a href="/search-params-page?foo=bar">
            Go to search params page (MPA)
          </a>
        </li>
        <li>
          <Link href="/client-fetch-page">Go to client fetch page</Link>
        </li>
        <li>
          <a href="/client-fetch-page">Go to client fetch page (MPA)</a>
        </li>
        <li>
          <Link href="/root-blocking-page">
            Go to blocking route (no static shell)
          </Link>
        </li>
        <li>
          <a href="/root-blocking-page">
            Go to blocking route (no static shell) (MPA)
          </a>
        </li>
      </ul>
    </div>
  )
}
