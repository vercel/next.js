import React from 'react'
import Head from 'next/head'

export default class Page extends React.Component {
  render () {
    return (
      <div className={this.props.className}>
        <Head>
          <meta name='viewport' content='width=device-width, initial-scale=1' />
        </Head>
        {this.props.children}
      </div>
    )
  }
}
