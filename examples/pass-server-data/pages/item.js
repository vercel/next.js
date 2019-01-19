import { Component } from 'react'
import Link from 'next/link'
import fetch from 'isomorphic-unfetch'

export default class extends Component {
  static async getInitialProps ({ req, query }) {
    const isServer = !!req

    console.log('getInitialProps called:', isServer ? 'server' : 'client')

    if (isServer) {
      // When being rendered server-side, we have access to our data in query that we put there in routes/item.js,
      // saving us an http call. Note that if we were to try to require('../operations/get-item') here,
      // it would result in a webpack error.
      return { item: query.itemData }
    } else {
      // On the client, we should fetch the data remotely
      const res = await fetch('/_data/item', {
        headers: { Accept: 'application/json' }
      })
      const json = await res.json()
      return { item: json }
    }
  }

  render () {
    return (
      <div className='item'>
        <div>
          <Link href='/'>
            <a>Back Home</a>
          </Link>
        </div>
        <h1>{this.props.item.title}</h1>
        <h2>
          {this.props.item.subtitle} - {this.props.item.seller}
        </h2>
      </div>
    )
  }
}
