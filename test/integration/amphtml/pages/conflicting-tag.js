import Head from 'next/head'
import { withAmp } from 'next/amp'

export default withAmp(() => (
  <amp-layout className='abc' layout='responsive' width='1' height='1'>
    <Head>
      <meta name='viewport' content='something :p' />
    </Head>
    <span>Hello World</span>
  </amp-layout>
))
