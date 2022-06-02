import Link from 'next/link'

export default function Component() {
  return (
    <>
      <Link href="/gssp-redirect/en">
        <a id="to-gssp-redirect-en">to /gssp-redirect/en"</a>
      </Link>
      <Link href="/gssp-redirect/sv">
        <a id="to-gssp-redirect-sv">to /gssp-redirect/sv"</a>
      </Link>
      <Link href="/gssp-redirect/from-ctx">
        <a id="to-gssp-redirect-from-ctx">to /gssp-redirect/from-ctx</a>
      </Link>

      <Link href="/gsp-blocking-redirect/en">
        <a id="to-gsp-blocking-redirect-en">to /gsp-blocking-redirect/en"</a>
      </Link>
      <Link href="/gsp-blocking-redirect/sv">
        <a id="to-gsp-blocking-redirect-sv">to /gsp-blocking-redirect/sv"</a>
      </Link>
      <Link href="/gsp-blocking-redirect/from-ctx">
        <a id="to-gsp-blocking-redirect-from-ctx">
          to /gsp-blocking-redirect/from-ctx
        </a>
      </Link>

      <Link href="/gsp-fallback-redirect/en">
        <a id="to-gsp-fallback-redirect-en">to /gsp-fallback-redirect/en"</a>
      </Link>
      <Link href="/gsp-fallback-redirect/sv">
        <a id="to-gsp-fallback-redirect-sv">to /gsp-fallback-redirect/sv"</a>
      </Link>
      <Link href="/gsp-fallback-redirect/from-ctx">
        <a id="to-gsp-fallback-redirect-from-ctx">
          to /gsp-fallback-redirect/from-ctx
        </a>
      </Link>
    </>
  )
}
