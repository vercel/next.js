import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

// eslint-disable-next-line camelcase
export async function unstable_getServerProps({ params }) {
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
  }
}

export default ({ post, time, params }) => {
  return (
    <>
      <p>Post: {post}</p>
      <span>time: {time}</span>
      <div id="params">{JSON.stringify(params)}</div>
      <div id="query">{JSON.stringify(useRouter().query)}</div>
      <Link href="/">
        <a id="home">to home</a>
      </Link>
    </>
  )
}
