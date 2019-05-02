import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { params } = router
  return (
    <p>Show comments for {params.post} here</p>
  )
}
