import Head from 'next/head'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Daily Prebuilt + Next.js demo</title>
        <meta
          name="description"
          content="Daily Prebuilt video chat interface embedded in a Next.js app."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
