import { useRouter } from 'next/router'
import Post from '../../components/Post'

const PostPage = () => {
  const router = useRouter()
  const { postId } = router.query

  return <Post id={postId} />
}

export default PostPage
