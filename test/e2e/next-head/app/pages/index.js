import Head from 'next/head'
import { Meta } from '../components/meta'

export default function Page(props) {
  return (
    <>
      <Head>
        <meta name="test-head-1" content="hello" />
        <meta name="test-head-2" content="hello" />
      </Head>
      <Meta />
      <p>index page</p>
    </>
  )
}
