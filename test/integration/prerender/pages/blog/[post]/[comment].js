import React from 'react'
import Link from 'next/link'

export const config = {
  experimentalRevalidate: 5,
  experimentalPrerender: true,
}

export async function getStaticParams() {
  return [
    '/blog/post-1/comment-1',
    { post: 'post-2', comment: 'comment-2' }
  ]
}

export async function getStaticProps({ params }) {
  return {
    props: {
      post: params.post,
      comment: params.comment,
      time: new Date().getTime()
    }
  }
}

export default ({ post, comment, time }) => {
  return (
    <>
      <p>post: {post}</p>
      <p>comment: {comment}</p>
      <p>time: {time}</p>
      <Link href='/'>
        <a id='home'>to home</a>
      </Link>
    </>
  )
}
