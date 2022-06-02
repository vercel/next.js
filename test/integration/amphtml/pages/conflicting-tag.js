import Head from 'next/head'

export const config = { amp: true }

export default () => (
  <amp-layout className="abc" layout="responsive" width="1" height="1">
    <Head>
      <meta name="viewport" content="something :p" />
    </Head>
    <span>Hello World</span>
  </amp-layout>
)
