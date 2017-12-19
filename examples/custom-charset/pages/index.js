import React from 'react'
import Head from 'next/head'
export default class Index extends React.Component {
  static async getInitialProps ({res}) {
    let contentType = res._headers['content-type']
    let charSet = contentType ? contentType.slice(contentType.indexOf('=') + 1, contentType.length) : 'utf-8';
    return { charSet }
  }
  render () {
    return (
      <div>
        <Head>
          <meta charSet={this.props.charSet} className='next-head' />
          <div>Current charSet {this.props.charSet}</div>
        </Head>
      </div>
    )
  }
}
