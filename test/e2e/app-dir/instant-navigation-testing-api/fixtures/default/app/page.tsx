import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1 data-testid="home-title">Instant Navigation API Test</h1>
      <ul>
        <li>
          <Link href="/target-page" id="link-to-target">
            Go to target page
          </Link>
        </li>
        <li>
          <Link
            href="/runtime-prefetch-target?myParam=testValue"
            id="link-to-runtime-prefetch"
            prefetch
          >
            Go to runtime prefetch target
          </Link>
        </li>
        <li>
          <Link
            href="/full-prefetch-target"
            prefetch={true}
            id="link-to-full-prefetch"
          >
            Go to full prefetch target
          </Link>
        </li>
        <li>
          <Link href="/cookies-page" id="link-to-cookies-page">
            Go to cookies page
          </Link>
        </li>
        <li>
          <Link href="/cookies-with-param/x" id="link-to-cookies-with-param">
            Go to cookies-with-param page
          </Link>
        </li>
        <li>
          <Link href="/dynamic-params/unknown" id="link-to-dynamic-params">
            Go to dynamic params page
          </Link>
        </li>
        <li>
          <Link href="/dynamic-params/hello" id="link-to-static-dynamic-params">
            Go to static dynamic params page
          </Link>
        </li>
        <li>
          <Link
            href="/ungenerated-params/anything"
            id="link-to-ungenerated-params"
          >
            Go to ungenerated params page
          </Link>
        </li>
        <li>
          <Link
            href="/ungenerated-params-runtime/anything"
            id="link-to-ungenerated-params-runtime"
            prefetch
          >
            Go to ungenerated params runtime page
          </Link>
        </li>
        <li>
          <Link
            href="/mixed-params-runtime/en/anything"
            id="link-to-mixed-params-runtime"
            prefetch
          >
            Go to mixed params runtime page
          </Link>
        </li>
        <li>
          <Link href="/mixed-params/en/anything" id="link-to-mixed-params">
            Go to mixed params page (no runtime)
          </Link>
        </li>
        <li>
          <Link href="/search-params-page?foo=bar" id="link-to-search-params">
            Go to search params page
          </Link>
        </li>
        {/* Plain anchor for MPA navigation testing (bypasses client-side routing) */}
        <li>
          <a href="/target-page" id="plain-link-to-target">
            Go to target page (MPA)
          </a>
        </li>
        <li>
          <a href="/cookies-page" id="plain-link-to-cookies-page">
            Go to cookies page (MPA)
          </a>
        </li>
        <li>
          <a href="/dynamic-params/unknown" id="plain-link-to-dynamic-params">
            Go to dynamic params page (MPA)
          </a>
        </li>
        <li>
          <a
            href="/dynamic-params/hello"
            id="plain-link-to-static-dynamic-params"
          >
            Go to static dynamic params page (MPA)
          </a>
        </li>
        <li>
          <a
            href="/search-params-page?foo=bar"
            id="plain-link-to-search-params"
          >
            Go to search params page (MPA)
          </a>
        </li>
        <li>
          <Link href="/client-fetch-page" id="link-to-client-fetch">
            Go to client fetch page
          </Link>
        </li>
        <li>
          <a href="/client-fetch-page" id="plain-link-to-client-fetch">
            Go to client fetch page (MPA)
          </a>
        </li>
        <li>
          <Link href="/root-blocking-page" id="link-to-root-blocking">
            Go to blocking route (no static shell)
          </Link>
        </li>
        <li>
          <a href="/root-blocking-page" id="plain-link-to-root-blocking">
            Go to blocking route (no static shell) (MPA)
          </a>
        </li>
      </ul>
    </div>
  )
}
