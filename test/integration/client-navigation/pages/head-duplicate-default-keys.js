import React from 'react'
import Head from 'next/head'

export default () => (
  <div>
    <Head>
      {/* this will not render */}
      <meta charSet='utf-8' key='charSet' />
      {/* this will override the default (same key as the default) */}
      <meta charSet='iso-8859-5' key='charSet' />

      {/* this will not render */}
      <meta name='viewport' content='width=device-width' key='viewport' />
      {/* this will override the default (same key as the default) */}
      <meta
        name='viewport'
        content='width=device-width,initial-scale=1'
        key='viewport'
      />
    </Head>
    <h1>Meta tags with same keys as default get deduped</h1>
  </div>
)
