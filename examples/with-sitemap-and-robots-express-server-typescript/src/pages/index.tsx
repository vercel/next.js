import Head from 'next/head'
import React from 'react'
import { RobotsLink } from '../components/RobotsLink'
import { SitemapLink } from '../components/SitemapLink'

function Index() {
  return (
    <div style={{ padding: '10px 45px' }}>
      <Head>
        <title>Index page</title>
        <meta name="description" content="description for indexing bots" />
      </Head>
      <p>
        <RobotsLink />
        <br />
        <SitemapLink />
      </p>
    </div>
  )
}

export default Index
