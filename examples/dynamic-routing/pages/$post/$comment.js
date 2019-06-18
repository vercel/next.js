import { useRouter } from 'next/router'
import Link from 'next/link'
import Header from '../../components/header'

const $comment = () => {
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

export default $comment
