import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

// eslint-disable-next-line camelcase
export async function unstable_getServerProps({ query }) {
  if (query.post === 'post-10') {
    await new Promise(resolve => {
      setTimeout(() => resolve(), 1000)
    })
  }

  if (query.post === 'post-100') {
    throw new Error('such broken..')
  }

  return {
    query,
    post: query.post,
    time: (await import('perf_hooks')).performance.now(),
  }
}

export default ({ post, time, query }) => {
  return (
    <>
      <p>Post: {post}</p>
      <span>time: {time}</span>
      <div id="params">{JSON.stringify(query)}</div>
      <div id="query">{JSON.stringify(useRouter().query)}</div>
      <Link href="/">
        <a id="home">to home</a>
      </Link>
    </>
  )
}
