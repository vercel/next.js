import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { query } = router
  return <p>post: {query.post}</p>
}
