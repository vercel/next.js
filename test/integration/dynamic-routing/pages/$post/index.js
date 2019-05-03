import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { query } = router
  return <p>This is {query.post}</p>
}
