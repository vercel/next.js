import { Component } from 'react'
import Head from 'next/head'
import fetch from 'isomorphic-unfetch'

import Post from '../components/post'

export default class extends Component {
  static async getInitialProps () {
    // fetch list of posts
    const response = await fetch(
      'https://jsonplaceholder.typicode.com/posts?_page=1'
    )
    const postList = await response.json()
    return { postList }
  }

  render () {
    return (
      <main>
        <Head>
          <title>Home page</title>
        </Head>

        <h1>List of posts</h1>

        <section>
          {this.props.postList.map(post => (
            <Post {...post} key={post.id} />
          ))}
        </section>
      </main>
    )
  }
}
