import React from 'react'
import Head from 'next/head'

export default () => (
  <div>
    <Head>
      <link rel="stylesheet" href="style-a.css" key="my-style" />
      <link rel="stylesheet" href="style-b.css" key="my-style" />

      <script src="/test-async.js" async></script>
      <script src="/test-defer.js" defer="yas"></script>
    </Head>
    <h1>Streaming Head</h1>
  </div>
)
