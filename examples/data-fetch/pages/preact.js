import React from 'react'
import Link from 'next/link'
import fetch from 'isomorphic-unfetch'

export default class Preact extends React.Component {
  static async getInitialProps () {
    const res = await fetch('https://api.github.com/repos/developit/preact')
    const json = await res.json()
    return { stars: json.stargazers_count }
  }

  render () {
    return (
      <div>
        <p>Preact has {this.props.stars} ⭐</p>
        <Link href='/'>
          <a>I bet Next.js has more stars (?)</a>
        </Link>
      </div>
    )
  }
}
