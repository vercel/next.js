import React from 'react'
import Head from 'next/head'

export default () => (
  <div style={{ padding: '10px 45px' }}>
    <Head>
      <title>Index page</title>
      <meta name="description" content="description for indexing bots" />
    </Head>
    <p>
      <a href="/sitemap.xml" target="_blank">
        Sitemap
      </a>
      <br />
      <a href="/robots.txt" target="_blank">
        Robots
      </a>
    </p>
  </div>
)
