import React from 'react'

// eslint-disable-next-line camelcase
export async function getStaticPaths() {
  return {
    paths: [
      '/blog/post-1/comment-1',
      { params: { post: 'post-2', comment: 'comment-2' } },
      '/blog/post-1337/comment-1337',
      '/blog/post-123/comment-321',
    ],
    fallback: true,
  }
}

// eslint-disable-next-line camelcase
export async function getStaticProps({ params }) {
  return {
    props: {
      post: params.post,
      random: Math.random() + Date.now(),
      comment: params.comment,
      time: new Date().getTime(),
    },
    revalidate: 1,
  }
}

export default ({ post, comment, time, random }) => {
  if (!post) return <p>loading...</p>

  return (
    <>
      <p id="post">Post: {post}</p>
      <p id="comment">Comment: {comment}</p>
      <span id="time">time: {time}</span>
      <span id="random">random: {random}</span>
    </>
  )
}
