import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

export default (props) => (
  <div id="head-1">
    <Head>
      <meta name="description" content="Head One" />
      <title>this is head-1</title>
      <script type="text/javascript">
        {`
          const metaTag = document.createElement('meta')
          metaTag.name = 'injected-meta'
          const headCount = document.querySelector('meta[name=next-head-count]')
          document.head.insertBefore(metaTag, headCount)
        `}
      </script>
    </Head>
    <Link href="/nav/head-2">
      <a id="to-head-2">to head 2</a>
    </Link>
  </div>
)
