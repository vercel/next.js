import React from 'react'
import Head from 'next/head'

export default () => <div>
  <Head>
    {/* this will not render */}
    <meta charSet='utf-8' />
    {/* this will get rendered */}
    <meta charSet='iso-8859-5' />

    <meta content='my meta' />

    <React.Fragment>
      <title>Fragment title</title>
      <meta content='meta fragment' />
    </React.Fragment>

    {/* the following 2 links tag will be rendered both */}
    <link rel='stylesheet' href='/dup-style.css' />
    <link rel='stylesheet' href='/dup-style.css' />

    {/* only one tag will be rendered as they have the same key */}
    <link rel='stylesheet' href='dedupe-style.css' key='my-style' />
    <link rel='stylesheet' href='dedupe-style.css' key='my-style' />
  </Head>
  <h1>I can haz meta tags</h1>
</div>
