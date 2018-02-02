import React, { Component } from 'react'
import Link from 'next/link'

let count = 0

export default class SelfReload extends Component {
  static getInitialProps ({ res }) {
    if (res) return { count: 0 }
    count += 1

    return { count }
  }

  render () {
    return (
      <div id='hash-changes-page'>
        <Link href='#via-link'>
          <a id='via-link'>Via Link</a>
        </Link>
        <a href='#via-a' id='via-a'>Via A</a>
        <Link href='/nav/hash-changes'>
          <a id='page-url'>Page URL</a>
        </Link>
        <Link href='#'>
          <a id='via-empty-hash'>Via Empty Hash</a>
        </Link>
        <p>COUNT: {this.props.count}</p>
      </div>
    )
  }
}
