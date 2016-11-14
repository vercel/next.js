import React from 'react'
import Head from 'next/head'
import MyLink from './MyLink'

export default () => (
  <div style={{ marginBottom: 20 }}>
    <Head>
      {/* Import CSS for nprogress */}
      <link rel='stylesheet' type='text/css' href='http://ricostacruz.com/nprogress/nprogress.css' />
    </Head>

    <MyLink href='/'>
      Home
    </MyLink> |
    <MyLink href='/about'>
      About
    </MyLink>
  </div>
)
