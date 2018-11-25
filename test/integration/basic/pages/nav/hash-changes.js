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
        <Link href='#item-400'>
          <a id='scroll-to-item-400'>Go to item 400</a>
        </Link>
        <Link href='#name-item-400'>
          <a id='scroll-to-name-item-400'>Go to name item 400</a>
        </Link>
        <p>COUNT: {this.props.count}</p>
        {Array.from({length: 500}, (x, i) => i + 1).map(i => {
          return <div key={`item-${i}`} id={`item-${i}`}>{i}</div>
        })}
        {Array.from({length: 500}, (x, i) => i + 1).map(i => {
          return <div key={`item-${i}`} name={`name-item-${i}`}>{i}</div>
        })}
      </div>
    )
  }
}
