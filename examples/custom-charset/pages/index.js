import React from 'react'
import Head from 'next/head'
export default class Index extends React.Component {
  static async getInitialProps ({res}) {
    let contentType = res._headers['content-type']
    let charSet = contentType.slice(contentType.indexOf('=') + 1, contentType.length)
    return { charSet }
  }
  render () {
    return (
      <ul>
        <Head>
          <meta charSet={this.props.charSet} class='next-head' />
          <div>Current charSet {this.props.charSet}</div>
        </Head>
      </ul>
    )
  }
}
