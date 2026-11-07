import Head from 'next/head'
import Link from 'next/link'

export default () => (
  <div id="shared-title-page-a">
    <Head>
      <title>Shared Title</title>
    </Head>
    <h1>Heading A</h1>
    <Link href="/shared-title/page-b" id="shared-title-page-b-link">
      Go to a page with the same title but a different h1
    </Link>
  </div>
)
