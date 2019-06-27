import { useRouter } from 'next/router'
import Header from '../../components/header'

const Comment = () => {
  const router = useRouter()
  const { post, comment } = router.query

  return (
    <>
      <Header />
      <h1>Post: {post}</h1>
      <h1>Comment: {comment}</h1>
    </>
  )
}

export default Comment
