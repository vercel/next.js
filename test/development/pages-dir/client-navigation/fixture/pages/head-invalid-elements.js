import Head from 'next/head'

export default function HeadInvalidElementsPage() {
  return (
    <div>
      <Head>
        <html data-next-head-invalid="html" />
        <body data-next-head-invalid="body" />
        <title>Valid Head Title</title>
        <meta name="valid-head" content="kept" />
      </Head>
      <h1>Invalid head elements</h1>
    </div>
  )
}
