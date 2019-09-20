import React from 'react'
import Link from 'next/link'

export async function getStaticParams() {
  return [
    '/blog/post-1',
    { post: 'post-2' }
  ]
}

export async function unstable_getStaticProps({ params }) {
  return {
    props: {
      post: params.post,
      time: new Date().getTime()
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
