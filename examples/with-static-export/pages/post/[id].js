import { Component } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import fetch from 'isomorphic-unfetch'

export default class extends Component {
  static async getInitialProps ({ query }) {
    // fetch single post detail
    const response = await fetch(
      `https://jsonplaceholder.typicode.com/posts/${query.id}`
    )
    const post = await response.json()
    return { ...post }
  }

  render () {
    const { title, body } = this.props

    return (
      <main>
        <Head>
          <title>{title}</title>
        </Head>

        <h1>{title}</h1>

        <p>{body}</p>

        <Link href='/'>
          <a>Go back to home</a>
        </Link>
      </main>
    )
  }
}
