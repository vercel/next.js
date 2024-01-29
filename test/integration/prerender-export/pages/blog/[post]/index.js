import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import 'firebase/firestore'

export async function getStaticPaths() {
  return {
    paths: [
      '/blog/post-1',
      { params: { post: 'post-2' } },
      '/blog/[post3]',
      '/blog/post-4',
      '/blog/post.1',
      '/blog/post.1', // handle duplicates
    ],
    fallback: false,
  }
}

let counter = 0

export async function getStaticProps({ params }) {
  if (params.post === 'post-10') {
    await new Promise((resolve) => {
      setTimeout(() => resolve(), 1000)
    })
  }

  if (params.post === 'post-100') {
    throw new Error('such broken..')
  }

  if (params.post === 'post-999') {
    if (++counter < 6) {
      throw new Error('try again..')
    }
  }

  return {
    props: {
      params,
      post: params.post,
      time: (await import('perf_hooks')).performance.now(),
    },
  }
}

export default ({ post, time, params }) => {
  return (
    <>
      <p>Post: {post}</p>
      <span>time: {time}</span>
      <div id="params">{JSON.stringify(params)}</div>
      <div id="query">{JSON.stringify(useRouter().query)}</div>
      <Link href="/" id="home">
        to home
      </Link>
    </>
  )
}
