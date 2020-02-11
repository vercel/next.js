import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

// eslint-disable-next-line camelcase
export async function unstable_getStaticPaths() {
  return {
    paths: [
      '/blog/post-1',
      { params: { post: 'post-2' } },
      '/blog/[post3]',
      '/blog/post-4',
      '/blog/post.1',
      '/blog/post.1', // handle duplicates
    ],
  }
}

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps({ params }) {
  if (params.post === 'post-10') {
    await new Promise(resolve => {
      setTimeout(() => resolve(), 1000)
    })
  }

  if (params.post === 'post-100') {
    throw new Error('such broken..')
  }

  return {
    props: {
      params,
      post: params.post,
      time: (await import('perf_hooks')).performance.now(),
    },
    revalidate: 10,
  }
}

function Query() {
  return <div id="query">{JSON.stringify(useRouter().query)}</div>
}

// Do not change this, it is making sure our SSG transform handles
// export default in this way with a class component
export default class Page extends React.Component {
  render() {
    const { post, time, params } = this.props
    return (
      <>
        <p>Post: {post}</p>
        <span>time: {time}</span>
        <div id="params">{JSON.stringify(params)}</div>
        <Query />
        <Link href="/">
          <a id="home">to home</a>
        </Link>
      </>
    )
  }
}
