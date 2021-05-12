import Head from 'next/head'

export default function Safe() {
  return (
    <Head>
      <title>Foo</title>
      <link rel="preload" />
      <link rel="preconnect" />
    </Head>
  )
}
