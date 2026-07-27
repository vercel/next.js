import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

export async function getServerSideProps({ params, resolvedUrl }) {
  if (params.post === 'post-10') {
    await new Promise((resolve) => {
      setTimeout(() => resolve(), 1000)
    })
  }

  if (params.post === 'post-100') {
    throw new Error('such broken..')
  }

  return {
    props: {
      params,
      resolvedUrl,
      post: params.post,
      time: (await import('perf_hooks')).performance.now(),
    },
  }
}

export default ({ post, time, params, appProps, resolvedUrl }) => {
  const router = useRouter()

  return (
    <>
      <p>Post: {post}</p>
      <span>time: {time}</span>
      <div id="params">{JSON.stringify(params)}</div>
      <div id="query">{JSON.stringify(router.query)}</div>
      <div id="app-query">{JSON.stringify(appProps.query)}</div>
      <div id="app-url">{appProps.url}</div>
      <div id="resolved-url">{resolvedUrl}</div>
      <div id="as-path">{router.asPath}</div>
      <Link href="/" id="home">
        to home
      </Link>
    </>
  )
}
