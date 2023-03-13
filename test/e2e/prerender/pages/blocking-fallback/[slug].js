import fs from 'fs'
import path from 'path'
import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

export async function getStaticPaths() {
  return {
    paths: [
      {
        params: { slug: 'test-errors-1' },
      },
      {
        params: { slug: 'lots-of-data' },
      },
    ],
    fallback: 'blocking',
  }
}

export async function getStaticProps({ params }) {
  if (params.slug === 'lots-of-data') {
    return {
      props: {
        lotsOfData: new Array(256 * 1000).fill('a').join(''),
      },
    }
  }

  if (params.slug.startsWith('test-errors')) {
    const errorFile = path.join(process.cwd(), 'error.txt')
    if (fs.existsSync(errorFile)) {
      const data = await fs.readFileSync(errorFile, 'utf8')
      if (data.trim() === 'yes') {
        throw new Error('throwing error for /blocking-fallback/' + params.slug)
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 1000))

  console.log(`getStaticProps ${params.slug}`)

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
      <Link href="/" id="home">
        to home
      </Link>
    </>
  )
}
