import React from 'react'
import Link from 'next/link'

// eslint-disable-next-line camelcase
export async function unstable_getStaticParams () {
  return [
    '/blog/post-1',
    { post: 'post-2' },
    '/blog/[post3]',
    '/blog/post.1'
  ]
}

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps ({ params }) {
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
      post: params.post,
      time: (await import('perf_hooks')).performance.now()
    },
    revalidate: 10
  }
}

export default ({ post, time }) => {
  return (
    <>
      <p>Post: {post}</p>
      <span>time: {time}</span>
      <Link href='/'>
        <a id='home'>to home</a>
      </Link>
    </>
  )
}
