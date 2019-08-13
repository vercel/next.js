import React from 'react'
import Link from 'next/link'

export const config = { experimentalPrerender: true }

export default class Post extends React.Component {
  static async getInitialProps () {
    return {
      data: typeof window === 'undefined' ? 'SSR' : 'CSR'
    }
  }

  render () {
    return (
      <>
        <p>Post: {this.props.data}</p>
        <Link href='/'>
          <a id='home'>to home</a>
        </Link>
      </>
    )
  }
}
