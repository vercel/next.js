import React from 'react'

function Post({ postId }) {
  return (
    <div>
      <h1>My blog post #{postId}</h1>
      <p>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
        tempor incididunt ut labore et dolore magna aliqua.
      </p>
    </div>
  )
}

export function getStaticProps({ params: { id } }) {
  return { props: { postId: id } }
}

export function getStaticPaths() {
  return { paths: [], fallback: true }
}

export default Post
