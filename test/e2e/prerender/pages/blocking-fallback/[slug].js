import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}

export async function getStaticProps({ params }) {
  if (params.slug === 'non-serializable') {
    return {
      props: {
        hello: undefined,
      },
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 1000))

  return {
    props: {
      params,
      hello: 'world',
      post: params.slug,
      random: Math.random(),
      time: (await import('perf_hooks')).performance.now(),
    },
    revalidate: 1,
  }
}

export default ({ post, time, params }) => {
  if (useRouter().isFallback) {
    return <p>hi fallback</p>
  }

  return (
    <>
      <p>Post: {post}</p>
      <span id="time">time: {time}</span>
      <div id="params">{JSON.stringify(params)}</div>
      <div id="query">{JSON.stringify(useRouter().query)}</div>
      <Link href="/">
        <a id="home">to home</a>
      </Link>
    </>
  )
}
