import Head from 'next/head'

export default () => {
  return (
    <div>
      <Head>
        <meta charSet="iso-8859-5" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="title" content="head title" />
      </Head>
      <p>next/head should be placed above the document/head.</p>
    </div>
  )
}
