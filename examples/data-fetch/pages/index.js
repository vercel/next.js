import React from 'react'
import Link from 'next/link'
import fetch from 'isomorphic-unfetch'

export default class Index extends React.Component {
  static async getInitialProps () {
    const res = await fetch('https://api.github.com/repos/zeit/next.js')
    const json = await res.json()
    return { stars: json.stargazers_count }
  }

  render () {
    return (
      <div>
        <p>Next.js has {this.props.stars} ⭐️</p>
        <Link href='/preact'>
          <a>How about preact?</a>
        </Link>
      </div>
    )
  }
}
