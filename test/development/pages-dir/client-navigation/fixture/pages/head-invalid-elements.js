import Head from 'next/head'

export default function HeadInvalidElementsPage() {
  return (
    <div>
      <Head>
        <title>Invalid Elements Test</title>
        <html lang="en" />
        <body style={{ background: 'red' }} />
        <meta
          name="description"
          content="This page tests invalid elements in head"
        />
      </Head>
      <h1 id="head-invalid-elements">Head with Invalid Elements</h1>
      <p>
        This page should show warnings about invalid html and body tags in head.
      </p>
    </div>
  )
}
