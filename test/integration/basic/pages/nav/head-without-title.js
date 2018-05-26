import Head from 'next/head'

export default () => <div className='head-without-title'>
  <Head>
    <meta content='my meta' />
  </Head>
  <h1>I should use default title from document after client navigates there.</h1>
</div>
