import { Component } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import fetch from 'isomorphic-unfetch'

export async function getStaticPaths() {
  const response = await fetch(
    'https://jsonplaceholder.typicode.com/posts?_page=1'
  )
  const postList = await response.json()
  return {
    paths: postList.map(post => {
      return {
        params: {
          id: `${post.id}`,
        },
      }
    }),
    fallback: false,
  }
}

export async function getStaticProps({ params }) {
  // fetch single post detail
  const response = await fetch(
    `https://jsonplaceholder.typicode.com/posts/${params.id}`
  )
  const post = await response.json()
  return {
    props: post,
  }
}

export default class extends Component {
  render() {
    const { title, body } = this.props

    return (
      <main>
        <Head>
          <title>{title}</title>
        </Head>

        <h1>{title}</h1>

        <p>{body}</p>

        <Link href="/">
          <a>Go back to home</a>
        </Link>
      </main>
    )
  }
}
