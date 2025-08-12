import React from 'react'

// eslint-disable-next-line camelcase
export async function getServerSideProps({ params }) {
  if (params.post === 'post-10') {
    await new Promise((resolve) => {
      setTimeout(() => resolve(), 1000)
    })
  }

  return {
    props: {
      post: params.post,
      time: (await import('perf_hooks')).performance.now(),
    },
  }
}

export default ({ post, time }) => {
  return (
    <>
      <p>Post: {post}</p>
      <span>time: {time}</span>
    </>
  )
}
