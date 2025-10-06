import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import fs from 'node:fs/promises'

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: true,
  }
}

export async function getStaticProps({ params }) {
  while (true) {
    try {
      await fs.stat('resolve-static-props')
      break
    } catch (e) {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

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
      <span>time: {time}</span>
      <div id="params">{JSON.stringify(params)}</div>
      <div id="query">{JSON.stringify(useRouter().query)}</div>
      <Link href="/" id="home">
        to home
      </Link>
    </>
  )
}
