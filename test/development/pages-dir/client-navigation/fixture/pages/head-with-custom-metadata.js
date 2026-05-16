import Head from 'next/head'

export default function Page() {
  return (
    <div>
      <Head>
        <title>Title Page</title>
        <meta property="og:title" content="Title Content" />
        <meta name="description" content="Description Content" />
      </Head>
      <p>This is a page!</p>
    </div>
  )
}
