import React from 'react'
import Head from 'next/head'

export default () => (
  <div>
    <Head>
      {/* this should not cause a warning */}
      <script type="application/ld+json"></script>
    </Head>
    <h1>I can have meta tags</h1>
  </div>
)
