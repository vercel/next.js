/* global fetch */

import React, { Component } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { withRouter } from 'next/router'

import parseUri from '../src/parse-uri'

class Post extends Component {
  componentDidMount () {
    const uriParams = parseUri(this.props.router.asPath)

    // The data in this example is public, but for many applications, data fetching requires a user
    // session which is not known at build time. Since getInitialProps isn't run on the first load
    // of a static page, we use componentDidMount instead.
    fetch(`https://jsonplaceholder.typicode.com/posts/${uriParams.postId}`)
      .then(response => response.json())
      .then(post => this.setState({ post }))
  }

  state = {
    post: {}
  }

  render () {
    return (
      <main>
        <Head>
          <title>{this.state.post.title || ``}</title>
        </Head>

        <h1>{this.state.post.title}</h1>

        <p>{this.state.post.body}</p>

        <Link href='/'>
          <a>Go back to home</a>
        </Link>
      </main>
    )
  }
}

export default withRouter(Post)
