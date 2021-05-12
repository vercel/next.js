import Head from 'next/head'

export default function Safe() {
  return (
    <Head>
      <title>Foo</title>
      <link rel="preload" />
      <link rel="preconnect" />
      <meta name="author" content="" />
      <meta name="description" />
      <meta name="keywords" />
      <meta name="og:title" />
      <meta name="twitter:title" />
      <meta name="robots" />
    </Head>
  )
}
