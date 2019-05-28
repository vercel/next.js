import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { query } = router
  return <p>Show comments for {query.post} here</p>
}
