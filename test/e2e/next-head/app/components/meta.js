import Head from 'next/head'

export function Meta(props) {
  return (
    <>
      <Head>
        <meta name="test-head-3" content="hello" />
        <meta name="test-head-4" content="hello" />
        <>
          <meta name="test-in-fragment" content="hello" />
        </>
      </Head>
    </>
  )
}
