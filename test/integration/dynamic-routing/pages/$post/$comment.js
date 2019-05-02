import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { params } = router

  return (
    <p>I am {params.comment} on {params.post}</p>
  )
}
