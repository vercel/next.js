import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { params } = router
  return <p>This is {params.post}</p>
}
