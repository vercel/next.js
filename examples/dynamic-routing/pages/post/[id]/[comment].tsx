import { useRouter } from 'next/router'
import Header from '../../../components/header'

export default function CommentPage() {
  const router = useRouter()
  const id = router.query.id as string
  const comment = router.query.comment as string

  return (
    <>
      <Header />
      <h1>Post: {id}</h1>
      <h1>Comment: {comment}</h1>
    </>
  )
}
