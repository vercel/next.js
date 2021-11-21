import Link from 'next/link'

export default () => (
  <>
    <Link href="/old-path/first/fallback-blocking">
      <a id="old-fallback-blocking">to /old-path/first/fallback-blocking</a>
    </Link>
    <br />
    <Link href="/old-path/first/fallback">
      <a id="old-fallback">to /old-path/first/fallback</a>
    </Link>
    <br />
    <Link href="/old-path/first/no-fallback">
      <a id="old-no-fallback">to /old-path/first/no-fallback</a>
    </Link>
    <br />
    <Link href="/old-path/first/ssr">
      <a id="old-ssr">to /old-path/first/ssr</a>
    </Link>
    <br />
    <Link href="/old-path/first/unknown">
      <a id="unknown">to /old-path/first/unknown</a>
    </Link>
  </>
)
