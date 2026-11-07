import Head from 'next/head'
import Link from 'next/link'

export default () => (
  <div id="shared-title-no-h1-1">
    <Head>
      <title>Shared Title</title>
    </Head>
    <Link href="/shared-title/no-h1-2" id="shared-title-no-h1-2-link">
      Go to a page with the same title and no h1
    </Link>
  </div>
)
