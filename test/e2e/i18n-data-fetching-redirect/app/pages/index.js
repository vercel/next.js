import Link from 'next/link'

export default function Component() {
  return (
    <>
      <Link href="/gssp-redirect/en" id="to-gssp-redirect-en">
        to /gssp-redirect/en"
      </Link>
      <Link href="/gssp-redirect/sv" id="to-gssp-redirect-sv">
        to /gssp-redirect/sv"
      </Link>
      <Link href="/gssp-redirect/from-ctx" id="to-gssp-redirect-from-ctx">
        to /gssp-redirect/from-ctx
      </Link>

      <Link href="/gsp-blocking-redirect/en" id="to-gsp-blocking-redirect-en">
        to /gsp-blocking-redirect/en"
      </Link>
      <Link href="/gsp-blocking-redirect/sv" id="to-gsp-blocking-redirect-sv">
        to /gsp-blocking-redirect/sv"
      </Link>
      <Link
        href="/gsp-blocking-redirect/from-ctx"
        id="to-gsp-blocking-redirect-from-ctx"
      >
        to /gsp-blocking-redirect/from-ctx
      </Link>

      <Link href="/gsp-fallback-redirect/en" id="to-gsp-fallback-redirect-en">
        to /gsp-fallback-redirect/en"
      </Link>
      <Link href="/gsp-fallback-redirect/sv" id="to-gsp-fallback-redirect-sv">
        to /gsp-fallback-redirect/sv"
      </Link>
      <Link
        href="/gsp-fallback-redirect/from-ctx"
        id="to-gsp-fallback-redirect-from-ctx"
      >
        to /gsp-fallback-redirect/from-ctx
      </Link>
    </>
  )
}
