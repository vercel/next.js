import Link from 'next/link'
import Head from 'next/head'

export default function Page() {
  return (
    <div>
      <div>
        {/* NOTE: next/head will not work in RSC for now but not break either */}
        <Head>
          <title>internal-title</title>
        </Head>
        <Link href="/internal/test/rewrite" id="navigate-rewrite">
          Navigate Rewrite
        </Link>
      </div>
      <div>
        <Link href="/internal/test/redirect" id="navigate-redirect">
          Navigate Redirect
        </Link>
      </div>
    </div>
  )
}
