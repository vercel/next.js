import React from 'react'
import Head from 'next/head'

export default () => (
  <div>
    <Head>
      {/* this will not render */}
      <meta charSet="utf-8" key="charSet" />
      {/* this will not render */}
      <meta charSet="iso-8859-5" key="charSet" />
      {/* this will render instead of the default */}
      <meta name="viewport" content="width=500" key="viewport" />
    </Head>
    <Head>
      {/* this will override the the above */}
      <meta charSet="iso-8859-1" key="charSet" />
    </Head>
    <h1>Meta tags with same keys as default get deduped</h1>
  </div>
)
