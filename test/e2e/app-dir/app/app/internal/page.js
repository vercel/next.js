import Link from 'next/link'
import Head from 'next/head'

export default function Page() {
  return (
    <div>
      <div>
        <Head>
          <title>123</title>
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
