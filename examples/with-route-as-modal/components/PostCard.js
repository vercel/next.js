import React from 'react'
import Router from 'next/router'

const PostCard = ({ id }) => {
  return (
    <a
      className="postCard"
      href={`/posts/${id}`}
      onClick={e => {
        e.preventDefault()
        Router.push(`/?postId=${id}`, `/post/${id}`)
      }}
    >
      {id}
    </a>
  )
}

export default PostCard
