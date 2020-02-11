import React from 'react'
import Link from 'next/link'

// eslint-disable-next-line camelcase
export async function unstable_getStaticPaths() {
  return {
    paths: [
      '/blog/post-1/comment-1',
      { params: { post: 'post-2', comment: 'comment-2' } },
    ],
  }
}

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps({ params }) {
  return {
    props: {
      post: params.post,
      comment: params.comment,
      time: new Date().getTime(),
    },
    revalidate: 2,
  }
}

// Do not change this, it is making sure our SSG transform handles
// export default in this way with a class component
class Page extends React.Component {
  render() {
    const { post, comment, time } = this.props
    // we're in a loading state
    if (!post) {
      return <p>loading...</p>
    }

    return (
      <>
        <p>Post: {post}</p>
        <p>Comment: {comment}</p>
        <span>time: {time}</span>
        <Link href="/">
          <a id="home">to home</a>
        </Link>
      </>
    )
  }
}

export default Page
