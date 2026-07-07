import { useRouter } from 'next/router'

export default function Post() {
  const router = useRouter()

  return (
    <>
      <p id="comment">comment: {router.query.comment}</p>
      <p id="router">{JSON.stringify(router)}</p>
    </>
  )
}
