import React from 'react'

// eslint-disable-next-line camelcase
export async function getStaticPaths() {
  return {
    paths: ['/blog/post-1', { params: { post: 'post-2' } }, '/blog/post-123'],
    fallback: false,
  }
}

// eslint-disable-next-line camelcase
export async function getStaticProps({ params }) {
  if (params.post === 'post-10') {
    await new Promise((resolve) => {
      setTimeout(() => resolve(), 1000)
    })
  }

  return {
    props: {
      post: params.post,
      random: Math.random() + Date.now(),
      time: (await import('perf_hooks')).performance.now(),
    },
  }
}

export default ({ post, time, random }) => {
  if (!post) return <p>loading...</p>

  return (
    <>
      <p id="post">Post: {post}</p>
      <span id="time">time: {time}</span>
      <span id="random">random: {random}</span>
    </>
  )
}
