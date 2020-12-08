import Head from 'next/head'

export default () => (
  <Head>
    <script src="/script.js" async />
    <script src="/script.js" async={false} />
  </Head>
)
