import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1 data-testid="home-title">Instant Navigation API Test</h1>
      <Link href="/target-page" id="link-to-target">
        Go to target page
      </Link>
      <Link
        href="/runtime-prefetch-target?myParam=testValue"
        id="link-to-runtime-prefetch"
      >
        Go to runtime prefetch target
      </Link>
      <Link
        href="/full-prefetch-target"
        prefetch={true}
        id="link-to-full-prefetch"
      >
        Go to full prefetch target
      </Link>
      <Link href="/cookies-page" id="link-to-cookies-page">
        Go to cookies page
      </Link>
      <Link href="/dynamic-params/unknown" id="link-to-dynamic-params">
        Go to dynamic params page
      </Link>
      <Link href="/dynamic-params/hello" id="link-to-static-dynamic-params">
        Go to static dynamic params page
      </Link>
      <Link href="/ungenerated-params/anything" id="link-to-ungenerated-params">
        Go to ungenerated params page
      </Link>
      <Link
        href="/ungenerated-params-runtime/anything"
        id="link-to-ungenerated-params-runtime"
      >
        Go to ungenerated params runtime page
      </Link>
      <Link href="/search-params-page?foo=bar" id="link-to-search-params">
        Go to search params page
      </Link>
      {/* Plain anchor for MPA navigation testing (bypasses client-side routing) */}
      <a href="/target-page" id="plain-link-to-target">
        Go to target page (MPA)
      </a>
      <a href="/cookies-page" id="plain-link-to-cookies-page">
        Go to cookies page (MPA)
      </a>
      <a href="/dynamic-params/unknown" id="plain-link-to-dynamic-params">
        Go to dynamic params page (MPA)
      </a>
      <a href="/dynamic-params/hello" id="plain-link-to-static-dynamic-params">
        Go to static dynamic params page (MPA)
      </a>
      <a href="/search-params-page?foo=bar" id="plain-link-to-search-params">
        Go to search params page (MPA)
      </a>
      <Link href="/client-fetch-page" id="link-to-client-fetch">
        Go to client fetch page
      </Link>
      <a href="/client-fetch-page" id="plain-link-to-client-fetch">
        Go to client fetch page (MPA)
      </a>
    </div>
  )
}
