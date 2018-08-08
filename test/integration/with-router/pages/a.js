import * as React from 'react'
import { withRouter } from 'next/router'
import Head from 'next/head'

class PageA extends React.Component {
  goToB () {
    this.props.router.push('/b')
  }

  render () {
    return (
      <div id='page-a'>
        <Head>
          <title>page-a</title>
        </Head>
        <button onClick={() => this.goToB()}>Go to B</button>
      </div>
    )
  }
}

export default withRouter(PageA)
