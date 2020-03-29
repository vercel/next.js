import React from 'react'
import Post from '../../components/Post'
import { useRouter } from 'next/router'

const PostPage = () => {
  const router = useRouter()
  const { postId } = router.query

  return <Post id={postId} />
}

export default PostPage
