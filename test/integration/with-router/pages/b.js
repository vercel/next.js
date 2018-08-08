import * as React from 'react'
import Head from 'next/head'

class PageB extends React.Component {
  render () {
    return (
      <div id='page-b'>
        <Head>
          <title>page-b</title>
        </Head>
        <p>Page B!</p>
      </div>
    )
  }
}

export default PageB
