import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { query } = router
  return <p>onmpost: {query.post || 'pending'}</p>
}
