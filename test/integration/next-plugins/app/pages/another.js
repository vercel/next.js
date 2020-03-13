import Link from 'next/link'
import Head from 'next/head'

export default () => (
  <>
    <Head>
      <title>Another | next-plugins</title>
    </Head>
    <p id="another">Another</p>
    <Link href="/">
      <a id="to-home">home</a>
    </Link>
    <Link href="/something">
      <a id="to-something">something</a>
    </Link>
  </>
)
