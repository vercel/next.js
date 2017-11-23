import 'isomorphic-fetch'
import React from 'react'
import Fork from '../components/Fork'
import ForkWithoutMaterial from '../components/ForkWithoutMaterial'

export default class Index extends React.Component {
  static async getInitialProps ({ store }) {
    const res = await fetch(
      'https://api.github.com/repos/zeit/next.js'
    )
    const json = await res.json()
    return { stars: json.stargazers_count }
  }

  render () {
    const { stars } = this.props
    return (
      <div>
        <Fork stars={stars} />
        <ForkWithoutMaterial stars={stars} />
      </div>
    )
  }
}
