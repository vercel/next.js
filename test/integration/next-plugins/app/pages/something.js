import Link from 'next/link'
import Head from 'next/head'

export default () => (
  <>
    <Head>
      <title>Something | next-plugins</title>
    </Head>
    <p id='something'>something</p>
    <Link href='/'>
      <a id='to-home'>home</a>
    </Link>
    <Link href='/another'>
      <a id='to-another'>another</a>
    </Link>
  </>
)
