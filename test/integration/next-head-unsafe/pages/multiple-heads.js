import Head from 'next/head'

export default function Unsafe() {
  return (
    <>
      <Head>
        <title>Foo</title>
      </Head>
      <Head>
        <title>Foo</title>
      </Head>
    </>
  )
}
