import React from 'react'

// eslint-disable-next-line camelcase
export async function getServerSideProps({ params }) {
  return {
    props: {
      post: params.post,
      comment: params.comment,
      time: new Date().getTime(),
    },
  }
}

export default ({ post, comment, time }) => {
  return (
    <>
      <p>Post: {post}</p>
      <p>Comment: {comment}</p>
      <span>time: {time}</span>
    </>
  )
}
