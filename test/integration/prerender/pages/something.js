import React, { Component } from 'react'
import Link from 'next/link'

export const config = { experimentalPrerender: true }

class Page extends Component {
  static async getInitialProps () {
    return { world: 'world' }
  }

  render () {
    return (
      <>
        <p>hello {this.props.world}</p>
        <Link href='/'>
          <a id='home'>to home</a>
        </Link>
        <br />
        <Link href='/another'>
          <a id='another'>to another</a>
        </Link>
      </>
    )
  }
}

export default Page
