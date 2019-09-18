import React from 'react'
import Link from 'next/link'

export const config = {
  experimentalRevalidate: 10,
  experimentalPrerender: true,
}

export async function getStaticParams() {
  return [
    '/blog/post-1',
    { post: 'post-2' }
  ]
}

export async function getStaticProps({ params }) {
  return {
    props: {
      post: params.post,
      time: new Date().getTime()
    }
  }
}

export default ({ post, time }) => {
  return (
    <>
      <p>post: {post}</p>
      <p>time: {time}</p>
      <Link href='/'>
        <a id='home'>to home</a>
      </Link>
    </>
  )
}
