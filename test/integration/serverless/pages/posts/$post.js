import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { query } = router

  return (
    <p>Post: {query.post}</p>
  )
}
