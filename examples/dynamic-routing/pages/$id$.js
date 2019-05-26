import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { query } = router

  return <p>ID: {query.id}</p>
}
